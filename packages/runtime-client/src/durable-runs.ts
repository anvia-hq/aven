import type { Agent, AgentPrompt } from "@anvia/core";
import type { AgentInteractionResponse } from "@anvia/core/agent/interactions";
import {
  DurableConflictError,
  DurableRuntime,
  type DefinedGoal,
  type DurableAgentRegistration,
  type DurableEvent,
  type DurableRun,
} from "@anvia/durable";
import { SqliteDurableStore } from "@anvia/durable/sqlite";
import { projectToolEnd } from "@aven/agents/projection";
import type { SandboxToolName } from "@aven/agents/sandbox-tools";
import { asRecord } from "@aven/agents/values";
import type { RunEvent } from "@aven/protocol/events";
import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { hostname } from "node:os";
import { dirname } from "node:path";

import { createDurableEventMapper, type DurableEnd } from "./durable-events";
import {
  defineAvenGoal,
  startGoal,
  type FollowedGoal,
  type GoalContext,
  type GoalJournal,
  type GoalSpec,
} from "./durable-goals";
import type { Source } from "./run-outbox";

// Bump when the agent's tools or instructions change incompatibly: runs unfinished under an older
// version stop as "needs attention" instead of continuing under code that no longer matches.
const AGENT_VERSION = "1";

// Tools that are safe to repeat when the runner stopped while they ran. Everything else (commands,
// processes, the desktop) is not repeated: the run is told the outcome is unknown.
const SAFE_TOOLS = new Set<string>([
  "read_file",
  "write_file",
  "list_files",
  "list_ports",
  "list_processes",
  "read_process_logs",
  "wait_for_port",
] satisfies SandboxToolName[]);

// Journals this process has open. Durable refuses a journal whose owner is a live process, and a
// process that reloads in place (`bun --watch`) keeps its pid: it meets its own earlier lease.
const held = new Set<string>();

function releaseOwnLease(databasePath: string) {
  if (!existsSync(databasePath)) return;
  const database = new Database(databasePath);
  try {
    database
      .query(
        "UPDATE anvia_durable_owner SET token = NULL, pid = NULL, host = NULL WHERE pid = ? AND host = ?",
      )
      .run(process.pid, hostname());
  } catch {
    // Not a journal yet: durable creates it.
  } finally {
    database.close();
  }
}

const INTERRUPTED =
  "The runner restarted while this tool call was running, so its outcome is unknown: it may have finished, partly finished, or not started. Check the current state (files, git status, running processes) before repeating it, and do not assume it succeeded.";

/** Where an event goes, with the journal event it came from when it came from one. */
export type Emit = (event: RunEvent, source?: Source) => void;

// Model requests that fail transiently are tried this many times, waiting longer after each.
const MODEL_RETRY = { maxAttempts: 5, initialDelayMs: 1_000, maxDelayMs: 30_000 };

export type RunInput = {
  /** One per run: durable registers agents by id. A run that answers a question reuses the asked run's. */
  agent: Agent<unknown>;
  compaction?: DurableAgentRegistration["compaction"];
  /** Tokens the model's context holds, when known; the run reports how much of it is used. */
  contextWindow?: number;
};

export type FollowOptions = {
  /** The agent the run is registered under, when it is not the input's own. */
  agentId?: string;
  /** The last of the run's journal already told to the client. */
  after?: number;
  /** Leave the agent registered when the run ends: a goal's sessions share one. Default false. */
  keepAgent?: boolean;
};

/** One durable run being followed: its events as they happen, how it ended, and a way to stop it. */
export type FollowedRun = {
  durableId: string;
  /** Resolves with how the run ended; `onEvent` hears everything until then. */
  done: Promise<DurableEnd>;
  cancel(): Promise<void>;
};

// Runs agents through @anvia/durable (decision 0021). The journal is SQLite on this machine: it
// holds the machinery state (submissions, model responses, tool results) and, since durable keeps
// each session's conversation itself, the history the model sees. The control plane keeps the
// transcript a person reads.
export class DurableRuns {
  #runtime: DurableRuntime;
  // What a goal running in this journal uses of it.
  #goals: GoalJournal;
  // How many messages of a run's transcript the control plane has been sent, while the run waits.
  #sent = new Map<string, number>();
  readonly #path: string;

  private constructor(
    runtime: DurableRuntime,
    goal: DefinedGoal,
    contexts: Map<string, GoalContext>,
    path: string,
  ) {
    this.#path = path;
    this.#runtime = runtime;
    this.#goals = {
      runtime,
      goal,
      // What a goal's assessment may use, by the goal's agent: the thread's sandbox, as it is now.
      contexts,
      registerOrKeep: (input) => this.#registerOrKeep(input),
      follow: (run, input, onEvent, options) => this.#follow(run, input, onEvent, options),
      release: (agentId, end) => this.#release(agentId, end),
      revive: (agentIds) => this.#revive(agentIds),
    };
  }

  /**
   * Runs of the agents in `keepAgents` are waiting to be taken up again by a runner that restarted
   * (`rejoin`); every other run that was working is ended.
   */
  static async open(
    databasePath: string,
    keepAgents: ReadonlySet<string> = new Set(),
    onFatalError?: (error: unknown) => void,
  ) {
    mkdirSync(dirname(databasePath), { recursive: true });
    if (held.has(databasePath)) throw new Error(`The run journal ${databasePath} is already open`);
    releaseOwnLease(databasePath);
    const contexts = new Map<string, GoalContext>();
    const goal = defineAvenGoal(contexts);
    const runtime = await DurableRuntime.open({
      store: new SqliteDurableStore(databasePath),
      tasks: [{ registration: goal.registration }],
      onFatalError: (error) => (onFatalError ?? console.error)(error),
    });
    held.add(databasePath);
    const runs = new DurableRuns(runtime, goal, contexts, databasePath);
    await runs.#endInterrupted(keepAgents);
    return runs;
  }

  // A run that was working when this process stopped, and that no record asks for, is not
  // continued: nothing would ever follow it, and left unfinished it would hold its thread's queue
  // forever. A run parked on a question is kept; it needs nothing until it is answered.
  async #endInterrupted(keepAgents: ReadonlySet<string>) {
    for (const status of [
      "queued",
      "pending",
      "running",
      "retry_wait",
      "needs_attention",
    ] as const) {
      for (let after: number | undefined; ;) {
        const page = await this.#runtime.listRuns({ status, after, limit: 100 });
        for (const run of page.runs)
          if (!keepAgents.has(run.agentId))
            await this.#runtime.getRun(run.id).then((r) => r.cancel());
        if (page.nextCursor === undefined) break;
        after = page.nextCursor;
      }
    }
  }

  /** The run a thread has parked on a question, if any: the agent it needs to continue. */
  async asked(threadId: string) {
    const { runs } = await this.#runtime.listRuns({
      sessionId: threadId,
      status: "waiting",
      limit: 1,
    });
    return runs[0] && { runId: runs[0].id, agentId: runs[0].agentId };
  }

  async start(
    runId: string,
    threadId: string,
    prompt: AgentPrompt,
    input: RunInput,
    onEvent: Emit,
  ) {
    this.#register(input);
    try {
      const run = await this.#runtime.submit(
        { agentId: input.agent.id, sessionId: threadId, requestId: runId, prompt },
        { enqueue: true },
      );
      return this.#follow(run, input, onEvent);
    } catch (error) {
      this.#runtime.unregisterAgent(input.agent.id);
      throw error;
    }
  }

  // Continues the run a thread parked on its question, with the agent it was registered with. After
  // a restart there is none, so `restore` builds it again under the same id.
  async answer(
    asked: { runId: string; agentId: string },
    question: { id: string; toolCallId: string },
    response: AgentInteractionResponse,
    restore: () => RunInput,
    onEvent: Emit,
  ) {
    const input = restore();
    // Still registered from before the question: that agent carries on.
    this.#registerOrKeep(input);
    const run = await this.#runtime.getRun(asked.runId);
    // The question's result, as the agent's stream used to report it, so the client sees it answered.
    if (response.type === "tool-question")
      onEvent(
        projectToolEnd(question.toolCallId, { type: "json", value: { answers: response.answers } }),
      );
    // Followed from now on, so the answer does not replay the run's earlier events to the client.
    const followed = this.#follow(run, input, onEvent, {
      agentId: asked.agentId,
      after: await this.#cursor(run),
    });
    try {
      await run.respond(question.id, response);
    } catch (error) {
      // Nobody will read the follow that was just started.
      followed.done.catch(() => undefined);
      void followed.cancel();
      throw error;
    }
    return followed;
  }

  // Runs a goal through this journal (durable-goals.ts): working sessions until the verify commands
  // pass or the goal stops short.
  startGoal(goal: GoalSpec): Promise<FollowedGoal> {
    return startGoal(this.#goals, goal);
  }

  // Takes up a run that was working when this process stopped. Its agent is built again, and the run
  // goes on from the last of its journal that was told to the control plane (`after`).
  async rejoin(
    durableId: string,
    input: RunInput,
    after: number,
    onEvent: Emit,
  ): Promise<FollowedRun> {
    this.#registerOrKeep(input);
    const run = await this.#runtime.getRun(durableId);
    const followed = this.#follow(run, input, onEvent, { after });
    followed.done.catch(() => undefined);
    await this.#revive([input.agent.id]);
    return followed;
  }

  // Runs of these agents wait for their agent: `resume` parks them as needing attention until it is
  // registered, and a tool that was in flight parks them again. Both are cleared here.
  async #revive(agentIds: readonly string[]) {
    await this.#runtime.resume();
    for (let attempt = 0; attempt < 20; attempt++) {
      let waiting = false;
      for (const status of ["queued", "pending", "needs_attention"] as const) {
        const { runs } = await this.#runtime.listRuns({ status, limit: 100 });
        for (const summary of runs.filter((run) => agentIds.includes(run.agentId))) {
          waiting = true;
          if (status !== "needs_attention") continue;
          const run = await this.#runtime.getRun(summary.id);
          if (summary.blockedOperation) await this.#resolveUnknown(run, summary.blockedOperation);
          else await run.retry();
        }
      }
      if (!waiting) return;
      await Bun.sleep(50);
    }
  }

  /**
   * The turn the control plane files a run's outcome messages under. A run that stopped on a question
   * reports what it did after the answer on its own, so the numbers keep counting from the first part:
   * a question counts its messages for the answer to follow, any other end forgets the run.
   */
  transcriptTurn(durableId: string, end: Exclude<DurableEnd, { type: "error" }>) {
    const from = this.#sent.get(durableId) ?? 0;
    if (end.type === "interaction") this.#sent.set(durableId, from + end.messages.length);
    else this.#sent.delete(durableId);
    return from;
  }

  /** Stops a run of the journal that no process is following. */
  async cancelRun(durableId: string) {
    await (await this.#runtime.getRun(durableId)).cancel().catch(() => undefined);
  }

  async close() {
    await this.#runtime.close();
    held.delete(this.#path);
  }

  // An agent registered before (by the run that asked, or the process a restart replaced) carries on.
  #registerOrKeep(input: RunInput) {
    try {
      this.#register(input);
    } catch (error) {
      if (!(error instanceof DurableConflictError)) throw error;
    }
  }

  #register(input: RunInput) {
    this.#runtime.registerAgents([
      {
        agent: input.agent,
        version: AGENT_VERSION,
        stream: true,
        modelRetry: MODEL_RETRY,
        compaction: input.compaction,
        // Durable refuses a policy for a tool the agent does not have.
        toolRecovery: Object.fromEntries(
          input.agent.tools
            .filter((tool) => SAFE_TOOLS.has(tool.name))
            .map((tool) => [tool.name, "safe" as const]),
        ),
      },
    ]);
  }

  // Events after the ones a run already had when it was asked about, so an answered question does
  // not replay its history to the client.
  async #cursor(run: DurableRun) {
    return (await run.snapshot({ operations: false })).cursor;
  }

  #follow(
    run: DurableRun,
    input: RunInput,
    onEvent: Emit,
    options: FollowOptions = {},
  ): FollowedRun {
    const { agentId = input.agent.id, after, keepAgent } = options;
    const mapper = createDurableEventMapper({ contextWindow: input.contextWindow });
    // A run picked up part way has already been told about its past; the mapper still needs it to
    // pair a tool's result with its call.
    if (after) this.#replay(run.id, after, mapper);
    const done = (async (): Promise<DurableEnd> => {
      for await (const event of run.stream({ after })) {
        const { events, end } = mapper.map(event);
        for (const mapped of events) onEvent(mapped, { id: run.id, sequence: event.sequence });
        if (event.type === "status") await this.#resolveInterrupted(run, event);
        if (end) {
          if (!keepAgent) this.#release(agentId, end);
          return end;
        }
      }
      return { type: "error", error: "The run's journal ended without an outcome" };
    })();
    return {
      durableId: run.id,
      done,
      // A run that is already over, or a journal that is closing, has nothing left to cancel.
      cancel: () => run.cancel().catch(() => undefined),
    };
  }

  #replay(runId: string, upTo: number, mapper: ReturnType<typeof createDurableEventMapper>) {
    for (let at = 0; at < upTo;) {
      const page = this.#runtime.events(runId, at);
      if (page.length === 0) return;
      for (const event of page) if (event.sequence <= upTo) mapper.map(event);
      at = page.at(-1)!.sequence;
    }
  }

  // A tool call in flight when the runner stopped parks the run. Resolving it as "outcome unknown"
  // lets the run carry on, so the agent checks the state itself instead of the user resending.
  async #resolveInterrupted(run: DurableRun, event: DurableEvent) {
    if (asRecord(event.data).status !== "needs_attention") return;
    const { blockedOperation } = await run.status();
    if (blockedOperation) await this.#resolveUnknown(run, blockedOperation);
  }

  // The tool call's outcome is unknown, and the run is told so.
  async #resolveUnknown(run: DurableRun, operationId: string) {
    await run.resolveTool(operationId, { type: "error-text", value: INTERRUPTED });
  }

  // A run that is over frees its agent registration; one parked on a question keeps it.
  #release(agentId: string, end: DurableEnd) {
    if (end.type === "interaction") return;
    try {
      this.#runtime.unregisterAgent(agentId);
    } catch {
      // Still settling; the registration goes with the process.
    }
  }
}
