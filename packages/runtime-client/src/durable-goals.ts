import type { Message } from "@anvia/core";
import { defineGoal, type DurableTaskHandle, type GoalResult } from "@anvia/durable";
import { CODING_MAX_TURNS } from "@aven/agents/turn-limits";
import { asRecord } from "@aven/agents/values";

import { assessGoal } from "./goal-assessment";
import { goalSessionMarker } from "./goal-report";
import type {
  Emit,
  FollowedGoal,
  GoalEnd,
  GoalSpec,
  GoalState,
  RunInput,
} from "@aven/agent-backend/types";
import type { GoalContext, GoalJournal } from "./types";

const DEFAULT_GOAL_SESSIONS = 20;
const TURNS_PER_SESSION = CODING_MAX_TURNS;
const NO_PROGRESS_SESSIONS = 3;

type GoalTracker = {
  state: GoalState;
  saveState: (state: GoalState) => void;
  cursorOf: (durableId: string) => number;
};

type Session = {
  input: RunInput;
  onEvent: Emit;
  onSession: (session: number, messages: Message[]) => Promise<void>;
  tracker: GoalTracker;
  working: { runId?: string };
};

export function defineAvenGoal(contexts: Map<string, GoalContext>) {
  return defineGoal({
    name: "aven-goal",
    version: 1,
    rounds: "continue",
    assess: (assessment) => {
      const context = contexts.get(assessment.agentId);

      if (!context) throw new Error("The goal's sandbox is gone, so it cannot be checked");

      return assessGoal(assessment, context.verify);
    },
  });
}

export async function startGoal(journal: GoalJournal, goal: GoalSpec): Promise<FollowedGoal> {
  const { runId, request, input, verify, onEvent, onSession } = goal;
  const state = goal.state ?? { sessions: {} };
  const saveState = goal.saveState ?? (() => undefined);
  const cursorOf = goal.cursorOf ?? (() => 0);
  const agentId = input.agent?.id;

  if (!agentId) throw new Error("The native agent backend was started without an agent");

  journal.registerOrKeep(input);
  journal.contexts.set(agentId, { verify });
  const finished = async () => {
    journal.contexts.delete(agentId);
    await journal.release(agentId, { type: "response", messages: [] });
  };
  const maxSessions = request.maxSessions ?? DEFAULT_GOAL_SESSIONS;
  let handle: DurableTaskHandle<GoalResult>;
  try {
    handle = await journal.runtime.submitGoal(journal.goal, {
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
    await finished();
    throw error;
  }
  const tracker = { state, saveState, cursorOf };
  const working: { runId?: string } = {};
  const done = followGoal(journal, handle, {
    input,
    onEvent,
    onSession,
    tracker,
    working,
  }).finally(finished);

  if (Object.keys(state.sessions).length > 0) await journal.revive([agentId]);

  return {
    done,
    cancel: () => handle.cancel().catch(() => undefined),
    steer: async (prompt, requestId) => {
      const runId = working.runId ?? (await sessionRunning(journal, agentId));
      return runId !== undefined && (await journal.steer(runId, prompt, requestId));
    },
  };
}

async function sessionRunning(journal: GoalJournal, agentId: string) {
  for (const status of ["running", "pending", "queued"] as const) {
    const { runs } = await journal.runtime.listRuns({ status, limit: 100 });
    const run = runs.find((summary) => summary.agentId === agentId);

    if (run) return run.id;
  }
  return undefined;
}

async function followGoal(
  journal: GoalJournal,
  handle: DurableTaskHandle<GoalResult>,
  session: Session,
): Promise<GoalEnd> {
  const { onEvent, tracker } = session;
  const { state } = tracker;
  const seen = new Set<string>();
  const sessions: Promise<void>[] = [];
  const settled = () => Promise.all(sessions).then(() => undefined);

  const sessionStarted = async (runId: string) => {
    if (seen.has(runId)) return;

    seen.add(runId);
    const known = state.sessions[runId];

    if (known?.filed) return;

    const number = known?.number ?? Object.keys(state.sessions).length + 1;

    if (!known) {
      await settled();
      state.sessions[runId] = { number, filed: false };
      tracker.saveState(state);
      onEvent({ type: "text", delta: goalSessionMarker(number) });
    }

    session.working.runId = runId;
    sessions.push(followSession(journal, runId, number, session));
  };

  for await (const event of handle.stream()) {
    if (event.type !== "status") continue;

    const data = asRecord(event.data);
    const wait = asRecord(data.wait);

    if (data.status === "waiting" && wait.type === "agent" && typeof wait.runId === "string") {
      await sessionStarted(wait.runId);
      continue;
    }

    if (event.taskId !== handle.id) continue;

    if (data.status === "completed") {
      await settled();
      const { handoff } = await handle.result();
      return { type: "complete", summary: handoff.summary, evidence: handoff.evidence };
    }

    if (data.status === "waiting" && wait.type === "signal") {
      await settled();
      const { task } = await handle.snapshot();
      const checkpoint = asRecord(task.checkpoint);
      const handoff = asRecord(checkpoint.handoff);
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

async function followSession(
  journal: GoalJournal,
  runId: string,
  number: number,
  { input, onEvent, onSession, tracker, working }: Session,
) {
  try {
    const run = await journal.runtime.getRun(runId);
    const followed = journal.follow(run, input, onEvent, {
      keepAgent: true,
      after: tracker.cursorOf(runId),
    });
    const end = await followed.done;

    if (end.type === "response") {
      await onSession(number, end.messages);
      tracker.state.sessions[runId] = { number, filed: true };
      tracker.saveState(tracker.state);
    }
  } catch {
  } finally {
    if (working.runId === runId) working.runId = undefined;
  }
}
