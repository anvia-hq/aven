import type { Agent } from "@anvia/core";
import type { AgentInteractionResponse } from "@anvia/core/agent/interactions";
import {
  DurableConflictError,
  DurableRuntime,
  type DurableAgentRegistration,
  type DurableEvent,
  type DurableRun,
} from "@anvia/durable";
import { SqliteDurableStore } from "@anvia/durable/sqlite";
import { projectToolOutput } from "@aven/agents/projection";
import type { RunEvent } from "@aven/protocol/events";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { createDurableEventMapper, type DurableEnd } from "./durable-events";

// Bump when the agent's tools or instructions change incompatibly: runs unfinished under an older
// version stop as "needs attention" instead of continuing under code that no longer matches.
const AGENT_VERSION = "1";

// Model requests that fail transiently are tried this many times, waiting longer after each.
const MODEL_RETRY = { maxAttempts: 5, initialDelayMs: 1_000, maxDelayMs: 30_000 };

export type RunInput = {
  /** One per run: durable registers agents by id. A run that answers a question reuses the asked run's. */
  agent: Agent<unknown>;
  compaction?: DurableAgentRegistration["compaction"];
  /** Tokens the model's context holds, when known; the run reports how much of it is used. */
  contextWindow?: number;
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
  // How many messages of a run's transcript the control plane has been sent, while the run waits.
  #sent = new Map<string, number>();

  private constructor(runtime: DurableRuntime) {
    this.#runtime = runtime;
  }

  static async open(databasePath: string, onFatalError?: (error: unknown) => void) {
    mkdirSync(dirname(databasePath), { recursive: true });
    const runtime = await DurableRuntime.open({
      store: new SqliteDurableStore(databasePath),
      onFatalError: (error) => (onFatalError ?? console.error)(error),
    });
    const runs = new DurableRuns(runtime);
    await runs.#endInterrupted();
    return runs;
  }

  // A run that was working when this process stopped is not continued: the control plane ended it
  // when the link dropped, and a run left unfinished would hold its thread's queue forever. A run
  // parked on a question is kept; it needs nothing from this process until it is answered.
  async #endInterrupted() {
    for (const status of [
      "queued",
      "pending",
      "running",
      "retry_wait",
      "needs_attention",
    ] as const) {
      for (let after: number | undefined; ;) {
        const page = await this.#runtime.listRuns({ status, after, limit: 100 });
        for (const run of page.runs) await this.#runtime.getRun(run.id).then((r) => r.cancel());
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
    prompt: string,
    input: RunInput,
    onEvent: (event: RunEvent) => void,
  ) {
    this.#register(input);
    try {
      const run = await this.#runtime.submit(
        { agentId: input.agent.id, sessionId: threadId, requestId: runId, prompt },
        { enqueue: true },
      );
      return this.#follow(run, input.agent.id, input.contextWindow, onEvent);
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
    onEvent: (event: RunEvent) => void,
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
    const followed = this.#follow(
      run,
      asked.agentId,
      input.contextWindow,
      onEvent,
      await this.#cursor(run),
    );
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
    agentId: string,
    contextWindow: number | undefined,
    onEvent: (event: RunEvent) => void,
    after?: number,
  ): FollowedRun {
    const mapper = createDurableEventMapper({ contextWindow });
    const done = (async (): Promise<DurableEnd> => {
      for await (const event of run.stream({ after })) {
        const { events, end } = mapper.map(event as DurableEvent);
        for (const mapped of events) onEvent(mapped);
        if (end) {
          this.#release(run, agentId, end);
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

  // A run that is over frees its agent registration; one parked on a question keeps it.
  #release(run: DurableRun, agentId: string, end: DurableEnd) {
    if (end.type === "interaction") return;
    try {
      this.#runtime.unregisterAgent(agentId);
    } catch {
      // Still settling; the registration goes with the process.
    }
  }
}
