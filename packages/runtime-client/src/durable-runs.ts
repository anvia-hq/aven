import type { AgentPrompt, Message } from "@anvia/core";
import type { AgentInteractionResponse } from "@anvia/core/agent/interactions";
import {
  DurableConflictError,
  DurableRuntime,
  type DefinedGoal,
  type DurableEvent,
  type DurableRun,
} from "@anvia/durable";
import { SqliteDurableStore } from "@anvia/durable/sqlite";
import { projectToolEnd } from "@aven/agents/tool-projection";
import { asRecord } from "@aven/agents/values";
import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { hostname } from "node:os";
import { dirname } from "node:path";

import { AGENT_BACKEND_CAPABILITIES } from "@aven/protocol/runtime-wire";

import { createDurableEventMapper } from "./durable-events";
import { defineAvenGoal, startGoal } from "./durable-goals";
import { assertDurableToolConcurrency } from "./durable-tool-concurrency";
import { openRunDatabase } from "./run-outbox";
import type { SandboxToolName } from "@aven/agents/types";
import type {
  AgentBackend,
  DurableEnd,
  Emit,
  FollowedGoal,
  FollowedRun,
  FollowOptions,
  GoalContext,
  GoalJournal,
  GoalSpec,
  RunInput,
} from "./types";

const AGENT_VERSION = "2";

const TOOL_CONCURRENCY = 4;

const SAFE_TOOLS = new Set<string>([
  "read_file",
  "write_file",
  "list_files",
  "list_ports",
  "list_processes",
  "read_process_logs",
  "wait_for_port",
] satisfies SandboxToolName[]);

const MAX_PAYLOAD_BYTES = 64 * 1024 * 1024;

const held = new Map<string, DurableRuns>();

class TranscriptTurns {
  #db: Database;

  constructor(db: Database) {
    this.#db = db;
    db.run(
      "create table if not exists transcript_turns (run_id text primary key, turn integer not null)",
    );
  }

  from(runId: string) {
    return (
      this.#db
        .query<{ turn: number }, [string]>("select turn from transcript_turns where run_id = ?")
        .get(runId)?.turn ?? 0
    );
  }

  to(runId: string, turn: number) {
    this.#db
      .query("insert or replace into transcript_turns (run_id, turn) values (?, ?)")
      .run(runId, turn);
  }

  forget(runId: string) {
    this.#db.query("delete from transcript_turns where run_id = ?").run(runId);
  }

  close() {
    this.#db.close();
  }
}

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
  } finally {
    database.close();
  }
}

const INTERRUPTED =
  "The runner restarted while this tool call was running, so its outcome is unknown: it may have finished, partly finished, or not started. Check the current state (files, git status, running processes) before repeating it, and do not assume it succeeded.";

const MODEL_RETRY = { maxAttempts: 5, initialDelayMs: 1_000, maxDelayMs: 30_000 };

export class DurableRuns implements AgentBackend {
  readonly kind = "native" as const;
  readonly capabilities = AGENT_BACKEND_CAPABILITIES.native;
  #runtime: DurableRuntime;
  #goals: GoalJournal;
  #turns: TranscriptTurns;
  #open = true;

  private constructor(
    runtime: DurableRuntime,
    goal: DefinedGoal,
    contexts: Map<string, GoalContext>,
    path: string,
  ) {
    this.#turns = new TranscriptTurns(openRunDatabase(`${path}.state`));
    this.#runtime = runtime;
    this.#goals = {
      runtime,
      goal,
      contexts,
      registerOrKeep: (input) => this.#registerOrKeep(input),
      follow: (run, input, onEvent, options) => this.#follow(run, input, onEvent, options),
      release: (agentId, end) => this.#release(agentId, end),
      revive: (agentIds) => this.#revive(agentIds),
      steer: (durableId, prompt, requestId) => this.steer(durableId, prompt, requestId),
    };
  }

  static async open(
    databasePath: string,
    keepAgents: ReadonlySet<string> = new Set(),
    onFatalError?: (error: unknown) => void,
  ) {
    mkdirSync(dirname(databasePath), { recursive: true });
    const owner = held.get(databasePath);

    if (owner !== undefined && owner.#open)
      throw new Error(`The run journal ${databasePath} is already open`);

    held.delete(databasePath);
    releaseOwnLease(databasePath);
    const contexts = new Map<string, GoalContext>();
    const goal = defineAvenGoal(contexts);
    const runtime = await DurableRuntime.open({
      store: new SqliteDurableStore(databasePath),
      tasks: [{ registration: goal.registration }],
      limits: { maxPayloadBytes: MAX_PAYLOAD_BYTES },
      onFatalError: (error) => (onFatalError ?? console.error)(error),
    });
    let runs: DurableRuns | undefined;
    try {
      assertDurableToolConcurrency((registration) => runtime.registerAgents([registration]));
      runs = new DurableRuns(runtime, goal, contexts, databasePath);
      held.set(databasePath, runs);
      await runs.#endInterrupted(keepAgents);
      return runs;
    } catch (error) {
      held.delete(databasePath);
      await (runs?.close() ?? runtime.close()).catch(() => undefined);
      throw error;
    }
  }

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
      const agent = this.#agent(input);
      const run = await this.#runtime.submit(
        { agentId: agent.id, sessionId: threadId, requestId: runId, prompt },
        { enqueue: true },
      );
      return this.#follow(run, input, onEvent);
    } catch (error) {
      const agent = input.agent;

      if (agent) this.#runtime.unregisterAgent(agent.id);

      throw error;
    }
  }

  async steer(durableId: string, prompt: AgentPrompt, requestId: string) {
    const run = await this.#runtime.getRun(durableId);
    try {
      await run.steer({ prompt }, { requestId });
      return true;
    } catch (error) {
      if (error instanceof DurableConflictError) return false;

      throw error;
    }
  }

  async answer(
    asked: { runId: string; agentId: string },
    question: { id: string; toolCallId: string },
    response: AgentInteractionResponse,
    restore: () => RunInput,
    onEvent: Emit,
  ) {
    const input = restore();
    this.#registerOrKeep(input);
    const run = await this.#runtime.getRun(asked.runId);

    if (response.type === "tool-question")
      onEvent(
        projectToolEnd(question.toolCallId, { type: "json", value: { answers: response.answers } }),
      );

    const followed = this.#follow(run, input, onEvent, {
      agentId: asked.agentId,
      after: await this.#cursor(run),
    });
    try {
      await run.respond(question.id, response);
    } catch (error) {
      followed.done.catch(() => undefined);
      void followed.cancel();
      throw error;
    }
    return followed;
  }

  startGoal(goal: GoalSpec): Promise<FollowedGoal> {
    return startGoal(this.#goals, goal);
  }

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
    await this.#revive([this.#agent(input).id]);
    return followed;
  }

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

  transcriptTurn(durableId: string, end: Exclude<DurableEnd, { type: "error" }>) {
    const from = this.#turns.from(durableId);

    if (end.type === "interaction") this.#turns.to(durableId, from + end.messages.length);
    else this.#turns.forget(durableId);

    return from;
  }

  async unfinishedMessages(durableId: string): Promise<Message[]> {
    try {
      const { run } = await (await this.#runtime.getRun(durableId)).snapshot({ operations: false });

      if (run.status !== "failed" && run.status !== "cancelled") return [];

      if (run.exhaustion) return run.exhaustion.messages.slice(run.history.length);

      const { messages, prompt } = run.input;
      const asked: Message[] = [];

      if (messages) asked.push(...messages);
      else if (prompt !== undefined) {
        asked.push(typeof prompt === "string" ? { role: "user", content: prompt } : prompt);
      }

      const steered = Object.values(run.steering?.checkpoints ?? {}).flatMap((checkpoint) =>
        checkpoint.entries.flatMap((entry) => entry.messages),
      );
      return [...asked, ...steered];
    } catch {
      return [];
    }
  }

  async cancelRun(durableId: string) {
    await (await this.#runtime.getRun(durableId)).cancel().catch(() => undefined);
  }

  async close() {
    this.#open = false;
    try {
      await this.#runtime.close();
    } finally {
      this.#turns.close();
    }
  }

  #registerOrKeep(input: RunInput) {
    try {
      this.#register(input);
    } catch (error) {
      if (!(error instanceof DurableConflictError)) throw error;
    }
  }

  #agent(input: RunInput) {
    if (!input.agent) throw new Error("The native agent backend was started without an agent");

    return input.agent;
  }

  #register(input: RunInput) {
    const agent = this.#agent(input);
    this.#runtime.registerAgents([
      {
        agent,
        version: AGENT_VERSION,
        stream: true,
        toolConcurrency: TOOL_CONCURRENCY,
        modelRetry: MODEL_RETRY,
        compaction: input.compaction,
        toolRecovery: Object.fromEntries(
          agent.tools
            .filter((tool) => SAFE_TOOLS.has(tool.name))
            .map((tool) => [tool.name, "safe" as const]),
        ),
      },
    ]);
  }

  async #cursor(run: DurableRun) {
    return (await run.snapshot({ operations: false })).cursor;
  }

  #follow(
    run: DurableRun,
    input: RunInput,
    onEvent: Emit,
    options: FollowOptions = {},
  ): FollowedRun {
    const { agentId = this.#agent(input).id, after, keepAgent } = options;
    const mapper = createDurableEventMapper({ contextWindow: input.contextWindow });

    if (after) this.#replay(run.id, after, mapper);

    const done = (async (): Promise<DurableEnd> => {
      for await (const event of run.stream({ after })) {
        const { events, end } = mapper.map(await this.#withOutcome(run, event));
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
      cancel: () => run.cancel().catch(() => undefined),
    };
  }

  async #withOutcome(run: DurableRun, event: DurableEvent): Promise<DurableEvent> {
    const data = asRecord(event.data);

    if (event.type !== "status" || data.outcome !== undefined) return event;

    if (data.status !== "completed" && data.status !== "waiting") return event;

    const { run: record } = await run.snapshot({ operations: false });
    return { ...event, data: { ...data, outcome: record.outcome } } as DurableEvent;
  }

  #replay(runId: string, upTo: number, mapper: ReturnType<typeof createDurableEventMapper>) {
    for (let at = 0; at < upTo;) {
      const page = this.#runtime.events(runId, at);

      if (page.length === 0) return;

      for (const event of page) if (event.sequence <= upTo) mapper.map(event);
      at = page.at(-1)!.sequence;
    }
  }

  async #resolveInterrupted(run: DurableRun, event: DurableEvent) {
    if (asRecord(event.data).status !== "needs_attention") return;

    const { blockedOperation } = await run.status();

    if (blockedOperation) await this.#resolveUnknown(run, blockedOperation);
  }

  async #resolveUnknown(run: DurableRun, operationId: string) {
    await run.resolveTool(operationId, { type: "error-text", value: INTERRUPTED });
  }

  #release(agentId: string, end: DurableEnd) {
    if (end.type === "interaction") return;

    try {
      this.#runtime.unregisterAgent(agentId);
    } catch {}
  }
}
