import type { Agent, Message } from "@anvia/core";
import type { AgentInteractionResponse } from "@anvia/core/agent/interactions";
import {
  DurableConflictError,
  DurableRuntime,
  defineGoal,
  type DefinedGoal,
  type DurableAgentRegistration,
  type DurableEvent,
  type DurableRun,
  type DurableTaskHandle,
  type GoalResult,
} from "@anvia/durable";
import { SqliteDurableStore } from "@anvia/durable/sqlite";
import { projectToolOutput } from "@aven/agents/projection";
import type { GoalRequest } from "@aven/agents/tools/define-goal";
import type { RunEvent } from "@aven/protocol/events";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { createDurableEventMapper, type DurableEnd } from "./durable-events";
import { assessGoal, type CommandResult } from "./goal-assessment";
import type { Source } from "./run-outbox";
import { goalSessionMarker } from "./goal-report";

// Bump when the agent's tools or instructions change incompatibly: runs unfinished under an older
// version stop as "needs attention" instead of continuing under code that no longer matches.
const AGENT_VERSION = "1";

// Tools that are safe to repeat when the runner stopped while they ran. Everything else (commands,
// processes, the desktop) is not repeated: the run is told the outcome is unknown.
const SAFE_TOOLS = new Set([
  "read_file",
  "write_file",
  "list_files",
  "list_ports",
  "list_processes",
  "read_process_logs",
  "wait_for_port",
]);

const INTERRUPTED =
  "The runner restarted while this tool call was running, so its outcome is unknown: it may have finished, partly finished, or not started. Check the current state (files, git status, running processes) before repeating it, and do not assume it succeeded.";

/** Where an event goes, with the journal event it came from when it came from one. */
export type Emit = (event: RunEvent, source?: Source) => void;

// A goal's limits, as the agent may raise or lower the sessions. A session is one agent run, which
// the agent's own step limit bounds, so the turns follow from the sessions.
const DEFAULT_GOAL_SESSIONS = 20;
const TURNS_PER_SESSION = 60;
const NO_PROGRESS_SESSIONS = 3;

// Model requests that fail transiently are tried this many times, waiting longer after each.
const MODEL_RETRY = { maxAttempts: 5, initialDelayMs: 1_000, maxDelayMs: 30_000 };

export type RunInput = {
  /** One per run: durable registers agents by id. A run that answers a question reuses the asked run's. */
  agent: Agent<unknown>;
  compaction?: DurableAgentRegistration["compaction"];
  /** Tokens the model's context holds, when known; the run reports how much of it is used. */
  contextWindow?: number;
};

/** How a goal ended. `paused` is a stop short of done: blocked, out of sessions, or going nowhere. */
export type GoalEnd =
  | { type: "complete"; summary: string; evidence: string[] }
  | { type: "paused"; reason: string; summary: string; next: string }
  | { type: "error"; error: string };

/** What a goal needs remembered to be taken up again: its task, and each session it has seen. */
export type GoalState = {
  taskId?: string;
  sessions: Record<string, { number: number; filed: boolean }>;
};

export type FollowedGoal = { done: Promise<GoalEnd>; cancel(): Promise<void> };

type GoalTracker = {
  state: GoalState;
  saveState: (state: GoalState) => void;
  cursorOf: (durableId: string) => number;
};

type GoalContext = { verify: () => Promise<CommandResult[]> };

const record = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};

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
  #goal: DefinedGoal;
  // What a goal's assessment may use, by the goal's agent: the thread's sandbox, as it is now.
  #contexts: Map<string, GoalContext>;
  // How many messages of a run's transcript the control plane has been sent, while the run waits.
  #sent = new Map<string, number>();

  private constructor(
    runtime: DurableRuntime,
    goal: DefinedGoal,
    contexts: Map<string, GoalContext>,
  ) {
    this.#runtime = runtime;
    this.#goal = goal;
    this.#contexts = contexts;
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
    const contexts = new Map<string, GoalContext>();
    // Every session of a goal continues the last one's conversation, so nothing is lost between them.
    const goal = defineGoal({
      name: "aven-goal",
      version: 1,
      rounds: "continue",
      assess: (assessment) => {
        const context = contexts.get(assessment.agentId);
        if (!context) throw new Error("The goal's sandbox is gone, so it cannot be checked");
        return assessGoal(assessment, context.verify);
      },
    });
    const runtime = await DurableRuntime.open({
      store: new SqliteDurableStore(databasePath),
      tasks: [{ registration: goal.registration }],
      onFatalError: (error) => (onFatalError ?? console.error)(error),
    });
    const runs = new DurableRuns(runtime, goal, contexts);
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

  async start(runId: string, threadId: string, prompt: string, input: RunInput, onEvent: Emit) {
    this.#register(input);
    try {
      const run = await this.#runtime.submit(
        { agentId: input.agent.id, sessionId: threadId, requestId: runId, prompt },
        { enqueue: true },
      );
      return this.#follow(run, onEvent, {
        agentId: input.agent.id,
        contextWindow: input.contextWindow,
      });
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
    try {
      this.#register(input);
    } catch (error) {
      // Still registered from before the question: that agent carries on.
      if (!(error instanceof DurableConflictError)) throw error;
    }
    const run = await this.#runtime.getRun(asked.runId);
    // The question's result, as the agent's stream used to report it, so the client sees it answered.
    if (response.type === "tool-question")
      onEvent({
        type: "tool_end",
        id: question.toolCallId,
        ...projectToolOutput({ type: "json", value: { answers: response.answers } }),
      });
    // Followed from now on, so the answer does not replay the run's earlier events to the client.
    const followed = this.#follow(run, onEvent, {
      agentId: asked.agentId,
      contextWindow: input.contextWindow,
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

  // Runs a goal: working sessions one after another, each followed for its events, until the verify
  // commands pass or the goal stops short. `onSession` hears each session's messages when it ends.
  // With a task in `state` the goal is taken up again where a restart left it (`cursorOf` says how
  // much of each session was already reported).
  async startGoal(goal: {
    runId: string;
    request: GoalRequest;
    input: RunInput;
    verify: () => Promise<CommandResult[]>;
    onEvent: Emit;
    onSession: (session: number, messages: Message[]) => Promise<void>;
    /** What a restart needs remembered; omit for a goal that is not kept. */
    state?: GoalState;
    saveState?: (state: GoalState) => void;
    cursorOf?: (durableId: string) => number;
  }): Promise<FollowedGoal> {
    const { runId, request, input, verify, onEvent, onSession } = goal;
    const state = goal.state ?? { sessions: {} };
    const saveState = goal.saveState ?? (() => undefined);
    const cursorOf = goal.cursorOf ?? (() => 0);
    const agentId = input.agent.id;
    try {
      this.#register(input);
    } catch (error) {
      // Registered by the process that was working on it before the restart.
      if (!(error instanceof DurableConflictError)) throw error;
    }
    this.#contexts.set(agentId, { verify });
    const finished = () => {
      this.#contexts.delete(agentId);
      this.#release(agentId, { type: "response", messages: [] });
    };
    const maxSessions = request.maxSessions ?? DEFAULT_GOAL_SESSIONS;
    let handle: DurableTaskHandle<GoalResult>;
    try {
      // The same ids give the goal that is already there, if a restart interrupted this call.
      handle = await this.#runtime.submitGoal(this.#goal, {
        sessionId: `goal:${runId}`,
        requestId: runId,
        agentId,
        objective: request.objective,
        acceptanceCriteria: request.acceptanceCriteria,
        limits: {
          maxSessions,
          maxTotalModelTurns: maxSessions * TURNS_PER_SESSION,
          maxConsecutiveNoProgressSessions: NO_PROGRESS_SESSIONS,
        },
      });
      state.taskId = handle.id;
      saveState(state);
    } catch (error) {
      finished();
      throw error;
    }
    const tracker = { state, saveState, cursorOf };
    const done = this.#followGoal(handle, input, onEvent, onSession, tracker).finally(finished);
    // After a restart the goal's sessions wait for their agent, which is registered now.
    if (Object.keys(state.sessions).length > 0) await this.#revive([agentId]);
    return { done, cancel: () => handle.cancel().catch(() => undefined) };
  }

  async #followGoal(
    handle: DurableTaskHandle<GoalResult>,
    input: RunInput,
    onEvent: Emit,
    onSession: (session: number, messages: Message[]) => Promise<void>,
    tracker: GoalTracker,
  ): Promise<GoalEnd> {
    const { state } = tracker;
    const seen = new Set<string>();
    const sessions: Promise<void>[] = [];
    // A session ends before the goal hears of it, and its transcript must be filed first.
    const settled = () => Promise.all(sessions).then(() => undefined);

    for await (const event of handle.stream()) {
      if (event.type !== "status") continue;
      const data = record(event.data);
      const wait = record(data.wait);
      if (data.status === "waiting" && wait.type === "agent" && typeof wait.runId === "string") {
        if (!seen.has(wait.runId)) {
          seen.add(wait.runId);
          const known = state.sessions[wait.runId];
          // A session a restart interrupted was told to the client up to a point, and has its number.
          if (known?.filed) continue;
          const session = known?.number ?? Object.keys(state.sessions).length + 1;
          if (!known) {
            state.sessions[wait.runId] = { number: session, filed: false };
            tracker.saveState(state);
            onEvent({ type: "text", delta: goalSessionMarker(session) });
          }
          sessions.push(
            this.#followSession(wait.runId, session, input, onEvent, onSession, tracker),
          );
        }
        continue;
      }
      if (event.taskId !== handle.id) continue;

      if (data.status === "completed") {
        await settled();
        const { handoff } = await handle.result();
        return { type: "complete", summary: handoff.summary, evidence: handoff.evidence };
      }
      // A goal that stops short waits for a signal to resume; Aven does not send one.
      if (data.status === "waiting" && wait.type === "signal") {
        await settled();
        const { task } = await handle.snapshot();
        const checkpoint = record(task.checkpoint);
        const handoff = record(checkpoint.handoff);
        await handle.cancel().catch(() => undefined);
        return {
          type: "paused",
          reason: String(checkpoint.pauseReason ?? "requested"),
          summary: String(handoff.summary ?? ""),
          next: String(handoff.next ?? ""),
        };
      }
      if (data.status === "failed" || data.status === "cancelled") {
        await settled();
        return { type: "error", error: String(data.error ?? `The goal ${data.status}`) };
      }
    }
    return { type: "error", error: "The goal's journal ended without an outcome" };
  }

  async #followSession(
    runId: string,
    session: number,
    input: RunInput,
    onEvent: Emit,
    onSession: (session: number, messages: Message[]) => Promise<void>,
    tracker: GoalTracker,
  ) {
    try {
      const run = await this.#runtime.getRun(runId);
      const followed = this.#follow(run, onEvent, {
        agentId: input.agent.id,
        contextWindow: input.contextWindow,
        keepAgent: true,
        after: tracker.cursorOf(runId),
      });
      const end = await followed.done;
      if (end.type === "response") {
        await onSession(session, end.messages);
        tracker.state.sessions[runId] = { number: session, filed: true };
        tracker.saveState(tracker.state);
      }
    } catch {
      // A session that failed is the goal's to report: it pauses as `session_failed`.
    }
  }

  // Takes up a run that was working when this process stopped. Its agent is built again, and the run
  // goes on from the last of its journal that was told to the control plane (`after`).
  async rejoin(
    durableId: string,
    input: RunInput,
    after: number,
    onEvent: Emit,
  ): Promise<FollowedRun> {
    try {
      this.#register(input);
    } catch (error) {
      if (!(error instanceof DurableConflictError)) throw error;
    }
    const run = await this.#runtime.getRun(durableId);
    const followed = this.#follow(run, onEvent, {
      agentId: input.agent.id,
      contextWindow: input.contextWindow,
      after,
    });
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
          if (summary.blockedOperation)
            await run.resolveTool(summary.blockedOperation, {
              type: "error-text",
              value: INTERRUPTED,
            });
          else await run.retry();
        }
      }
      if (!waiting) return;
      await Bun.sleep(50);
    }
  }

  /**
   * The turn the control plane files a run's outcome messages under. A run that stopped on a question
   * reports what it did after the answer on its own, so the numbers keep counting from the first part.
   */
  transcriptTurn(durableId: string, count: number, over: boolean) {
    const from = this.#sent.get(durableId) ?? 0;
    if (over) this.#sent.delete(durableId);
    else this.#sent.set(durableId, from + count);
    return from;
  }

  /** Stops a run of the journal that no process is following. */
  async cancelRun(durableId: string) {
    await (await this.#runtime.getRun(durableId)).cancel().catch(() => undefined);
  }

  async close() {
    await this.#runtime.close();
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
    onEvent: Emit,
    options: {
      agentId: string;
      contextWindow: number | undefined;
      after?: number;
      /** Leave the agent registered when the run ends: a goal's sessions share one. Default false. */
      keepAgent?: boolean;
    },
  ): FollowedRun {
    const { agentId, contextWindow, after, keepAgent } = options;
    const mapper = createDurableEventMapper({ contextWindow });
    // A run picked up part way has already been told about its past; the mapper still needs it to
    // pair a tool's result with its call.
    if (after) this.#replay(run.id, after, mapper);
    const done = (async (): Promise<DurableEnd> => {
      for await (const event of run.stream({ after })) {
        const { events, end } = mapper.map(event as DurableEvent);
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
    if ((event.data as { status?: string }).status !== "needs_attention") return;
    const { blockedOperation } = await run.status();
    if (blockedOperation)
      await run.resolveTool(blockedOperation, { type: "error-text", value: INTERRUPTED });
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
