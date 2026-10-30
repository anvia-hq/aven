import type { AnyTool, Message } from "@anvia/core";
import {
  parseAgentContinuation,
  parseAgentInteractionResponse,
} from "@anvia/core/agent/interactions";
import { createDefineGoalTool, type GoalRequest } from "@aven/agents/tools/define-goal";
import type { RunEvent } from "@aven/protocol/events";
import type {
  CallMethod,
  MemoryAppendParams,
  RepoAccess,
  RunModel,
  RuntimeToControlPlane,
} from "@aven/protocol/runtime-wire";

import type { CreateRuntimeAgent } from "./runner";
import { DurableRuns, type Emit, type FollowedRun, type RunInput } from "./durable-runs";
import type { DurableEnd } from "./durable-events";
import { verifyWith } from "./goal-assessment";
import { goalReport, goalSessionMessage } from "./goal-report";
import { lateBoundTools } from "./late-bound-tools";
import type { RunOutbox, Source } from "./run-outbox";
import type { RunRecord, RunRecords } from "./run-records";
import type { ThreadSandbox, ThreadWorkspaces } from "./sandbox";

export type RunMessage = {
  runId: string;
  thread: RunRecord["thread"];
  model?: RunModel;
} & (
  | { type: "run.start"; prompt: string }
  | { type: "run.resume"; continuation: unknown; response: unknown }
);

type Live = {
  threadId: string;
  /** Not there until the thread's sandbox is up and the run is in the journal; a goal's, while it works. */
  followed?: Pick<FollowedRun, "cancel">;
  /** Why the run was cancelled, also when the cancel arrived before there was a run to cancel. */
  cancelReason?: string;
};

export type DriverContext = {
  journal: Promise<DurableRuns>;
  records: RunRecords;
  outbox: RunOutbox;
  sandbox: ThreadWorkspaces;
  createAgent: CreateRuntimeAgent;
  call(method: CallMethod, params: unknown): Promise<unknown>;
  /** Sends a message of a run, or keeps it for when the control plane asks. */
  report(
    runId: string,
    make: (seq: number) => Extract<RuntimeToControlPlane, { type: "run.event" | "run.end" }>,
    source?: Source,
  ): void;
  /** The sandboxes of the threads that have one. */
  boxes: Map<string, ThreadSandbox>;
  /** A run is about to use the thread's sandbox: it must not be released as idle. */
  starting(threadId: string): Promise<void>;
  /** A run is over: the thread's sandbox may be released once it has been idle for a while. */
  finished(threadId: string): void;
  /** The runner is shutting down: its state is closed, so nothing more is recorded. */
  stopped(): boolean;
};

// Runs one wire run from its first message to its end: the agent's turn, a goal it hands over, and
// the report on it. What it needs to take the run up again after a restart is in a record, saved as
// it goes (decision 0024).
export function createRunDriver(context: DriverContext) {
  const { records, outbox, report } = context;
  const live = new Map<string, Live>();
  // The goal a thread's agent handed over this run, started once its turn ends.
  const goals = new Map<string, GoalRequest>();

  async function execute(initial: RunRecord, message?: RunMessage) {
    let record = initial;
    const { runId, thread, model } = record;
    const run: Live = { threadId: thread.id };
    live.set(runId, run);
    const save = (changes: Partial<RunRecord>) => {
      record = { ...record, ...changes };
      if (!context.stopped()) records.save(record);
    };
    try {
      await context.starting(thread.id);
      // Clones the repository and starts the thread's container on first use; a failure ends the run with a clear error.
      const box = await context.sandbox.acquire(
        thread,
        () => context.call("repo.access", { runId }) as Promise<RepoAccess>,
      );
      if (run.cancelReason) throw new Error(run.cancelReason);
      context.boxes.set(thread.id, box);
      const journaled = await context.journal;
      // The thread's sandbox as it is now: a run that waited for an answer may find it replaced.
      const current = () => context.boxes.get(thread.id)?.tools;

      const build = (id: string, attended: boolean): RunInput => {
        const bound: AnyTool[] = lateBoundTools(box.tools, current);
        const { agent, compaction } = context.createAgent({
          thread,
          id,
          attended,
          // Only an agent with a person to talk to may take on a goal.
          tools: attended
            ? [
                ...bound,
                createDefineGoalTool((goal) => {
                  goals.set(thread.id, goal);
                  save({ goal });
                }),
              ]
            : bound,
          model,
        });
        return { agent, compaction, contextWindow: model?.contextWindow };
      };
      // Events reach the control plane as the journal records them.
      const forward: Emit = (event: RunEvent, source) =>
        report(runId, (seq) => ({ type: "run.event", runId, seq, event }), source);
      // The transcript the control plane keeps, filed as each part of the run ends.
      const file = async (messages: Message[]) => {
        if (messages.length === 0) return;
        await context.call("memory.append", {
          runId,
          turn: record.turn,
          messages,
        } satisfies MemoryAppendParams);
        save({ turn: record.turn + messages.length });
      };
      // What an unattended part of the run is told is a note to the agent, not something the user said.
      const withoutPrompt = (messages: Message[]) =>
        messages[0]?.role === "user" ? messages.slice(1) : messages;
      const stopIfCancelled = () => {
        if (run.cancelReason) throw new Error(run.cancelReason);
      };

      const pursueGoal = async (request: GoalRequest) => {
        const exec = current()?.find((tool) => tool.name === "exec_command");
        const working = await journaled.startGoal(
          runId,
          request,
          build(`goal-${runId}`, false),
          verifyWith(exec, request.verifyCommands ?? []),
          forward,
          async (session, messages) =>
            file([goalSessionMessage(session), ...withoutPrompt(messages)]),
        );
        run.followed = working;
        return working.done;
      };

      let followed: FollowedRun;
      if (record.durableId) {
        // Picked up again after a restart: the run is in the journal, and the control plane has
        // heard everything of it up to the newest event this run reported.
        followed = await journaled.rejoin(
          record.durableId,
          build(record.agentId, true),
          outbox.cursor(runId, record.durableId),
          forward,
        );
      } else if (record.kind === "start") {
        followed = await journaled.start(
          runId,
          thread.id,
          record.prompt ?? "",
          build(record.agentId, true),
          forward,
        );
      } else {
        // The question stays parked in the journal; the answer is delivered to it.
        const asked = await journaled.asked(thread.id);
        if (!asked) throw new Error("This thread has no question waiting for an answer");
        // The run in the journal is the one that asked, with the agent it was registered under.
        save({ agentId: asked.agentId });
        const { interaction } = parseAgentContinuation(
          message?.type === "run.resume" ? message.continuation : undefined,
        );
        followed = await journaled.answer(
          asked,
          interaction,
          parseAgentInteractionResponse(
            message?.type === "run.resume" ? message.response : undefined,
          ),
          () => build(asked.agentId, true),
          forward,
        );
      }
      save({ durableId: followed.durableId });
      run.followed = followed;
      if (run.cancelReason) void followed.cancel();
      let end: DurableEnd = await followed.done;
      if (end.type !== "error") {
        // A run that stopped on a question and was answered files its second part after the first.
        save({
          turn: journaled.transcriptTurn(
            followed.durableId,
            end.messages.length,
            end.type === "response",
          ),
        });
        await file(end.messages);
      }

      // The turn handed over a goal: work it, then let the agent report on it in the thread.
      const goal = goals.get(thread.id);
      goals.delete(thread.id);
      if (goal && end.type === "response") {
        stopIfCancelled();
        const goalEnd = await pursueGoal(goal);
        if (goalEnd.type === "error") {
          end = goalEnd;
        } else {
          stopIfCancelled();
          const closing = await journaled.start(
            `${runId}-report`,
            thread.id,
            goalReport(goal.objective, goalEnd),
            build(`run-${runId}-report`, false),
            forward,
          );
          run.followed = closing;
          end = await closing.done;
          if (end.type !== "error") await file(withoutPrompt(end.messages));
        }
      }
      finish(runId, end, run.cancelReason);
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      finish(runId, { type: "error", error: text });
    } finally {
      // A goal handed over by a run that never got to start it is not the next run's to start.
      goals.delete(thread.id);
      live.delete(runId);
      context.finished(thread.id);
    }
  }

  // The run is over: tell the control plane, and note that nothing is left but its acknowledgement.
  function finish(runId: string, end: DurableEnd, cancelReason?: string) {
    if (context.stopped()) return;
    report(runId, (seq) =>
      end.type === "error"
        ? { type: "run.end", runId, seq, outcome: "error", error: cancelReason ?? end.error }
        : {
            type: "run.end",
            runId,
            seq,
            outcome: end.type,
            // What resumes a run that stopped to ask the user; the control plane keeps it.
            continuation: end.type === "interaction" ? end.continuation : undefined,
          },
    );
    const record = records.get(runId);
    if (record) records.save({ ...record, done: true });
  }

  return {
    /** Runs that are going in this process, for the sandbox's idle check and for cancels. */
    live,

    /** A run the control plane just started. */
    start(message: RunMessage) {
      const record: RunRecord = {
        runId: message.runId,
        thread: message.thread,
        model: message.model,
        kind: message.type === "run.start" ? "start" : "answer",
        prompt: message.type === "run.start" ? message.prompt : undefined,
        agentId: `run-${message.runId}`,
        turn: 0,
      };
      outbox.open(message.runId);
      records.save(record);
      return execute(record, message);
    },

    /** A run this process had before it restarted, which the control plane asked for again. */
    restore(runId: string) {
      const record = records.get(runId);
      // Nothing to take up: it is going, or it is over and only waiting to be acknowledged.
      if (!record || record.done || live.has(runId)) return;
      if (record.goal) {
        // A goal does not yet continue across a restart.
        void this.cancel(
          runId,
          "The runner restarted while the goal was working, so it stopped. Ask again to continue.",
        );
        return;
      }
      return execute(record);
    },

    async cancel(runId: string, reason: string) {
      const run = live.get(runId);
      if (run) {
        run.cancelReason = reason;
        void run.followed?.cancel();
        return;
      }
      // Not going in this process, yet the control plane wants it stopped: it is over.
      const record = records.get(runId);
      if (!record || record.done) return;
      if (record.durableId) await (await context.journal).cancelRun(record.durableId);
      // The control plane did not ask for this run, so it will not ask for its end either.
      outbox.attach(runId, Number.MAX_SAFE_INTEGER);
      finish(runId, { type: "error", error: reason }, reason);
    },

    forget(runId: string) {
      records.delete(runId);
    },
  };
}
