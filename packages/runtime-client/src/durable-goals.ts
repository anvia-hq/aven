import type { Message } from "@anvia/core";
import {
  defineGoal,
  type DefinedGoal,
  type DurableRun,
  type DurableRuntime,
  type DurableTaskHandle,
  type GoalResult,
} from "@anvia/durable";
import { CODING_MAX_TURNS } from "@aven/agents/turn-limits";
import type { GoalRequest } from "@aven/agents/tools/define-goal";
import { asRecord } from "@aven/agents/values";

import type { DurableEnd } from "./durable-events";
import type { Emit, FollowOptions, FollowedRun, RunInput } from "./durable-runs";
import { assessGoal, type CommandResult } from "./goal-assessment";
import { goalSessionMarker } from "./goal-report";

// A goal's limits, as the agent may raise or lower the sessions. A session is one agent run, which
// the agent's own step limit bounds, so the turns follow from the sessions.
const DEFAULT_GOAL_SESSIONS = 20;
const TURNS_PER_SESSION = CODING_MAX_TURNS;
const NO_PROGRESS_SESSIONS = 3;

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

/** What a goal's assessment may use: the thread's sandbox, as it is now. */
export type GoalContext = { verify: () => Promise<CommandResult[]> };

export type GoalSpec = {
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
};

/** What a goal needs of the journal it runs in (`DurableRuns`). */
export type GoalJournal = {
  runtime: DurableRuntime;
  goal: DefinedGoal;
  /** By the goal's agent. */
  contexts: Map<string, GoalContext>;
  registerOrKeep(input: RunInput): void;
  follow(run: DurableRun, input: RunInput, onEvent: Emit, options?: FollowOptions): FollowedRun;
  release(agentId: string, end: DurableEnd): void;
  revive(agentIds: readonly string[]): Promise<void>;
};

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
};

// Every session of a goal continues the last one's conversation, so nothing is lost between them.
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

// Runs a goal: working sessions one after another, each followed for its events, until the verify
// commands pass or the goal stops short. `onSession` hears each session's messages when it ends.
// With a task in `state` the goal is taken up again where a restart left it (`cursorOf` says how
// much of each session was already reported).
export async function startGoal(journal: GoalJournal, goal: GoalSpec): Promise<FollowedGoal> {
  const { runId, request, input, verify, onEvent, onSession } = goal;
  const state = goal.state ?? { sessions: {} };
  const saveState = goal.saveState ?? (() => undefined);
  const cursorOf = goal.cursorOf ?? (() => 0);
  const agentId = input.agent.id;
  // Registered by the process that was working on it before the restart.
  journal.registerOrKeep(input);
  journal.contexts.set(agentId, { verify });
  const finished = () => {
    journal.contexts.delete(agentId);
    journal.release(agentId, { type: "response", messages: [] });
  };
  const maxSessions = request.maxSessions ?? DEFAULT_GOAL_SESSIONS;
  let handle: DurableTaskHandle<GoalResult>;
  try {
    // The same ids give the goal that is already there, if a restart interrupted this call.
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
    finished();
    throw error;
  }
  const tracker = { state, saveState, cursorOf };
  const done = followGoal(journal, handle, { input, onEvent, onSession, tracker }).finally(
    finished,
  );
  // After a restart the goal's sessions wait for their agent, which is registered now.
  if (Object.keys(state.sessions).length > 0) await journal.revive([agentId]);
  return { done, cancel: () => handle.cancel().catch(() => undefined) };
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
  // A session ends before the goal hears of it, and its transcript must be filed first.
  const settled = () => Promise.all(sessions).then(() => undefined);

  // A session the goal started, told to the client and followed once.
  const sessionStarted = (runId: string) => {
    if (seen.has(runId)) return;
    seen.add(runId);
    const known = state.sessions[runId];
    // A session a restart interrupted was told to the client up to a point, and has its number.
    if (known?.filed) return;
    const number = known?.number ?? Object.keys(state.sessions).length + 1;
    if (!known) {
      state.sessions[runId] = { number, filed: false };
      tracker.saveState(state);
      onEvent({ type: "text", delta: goalSessionMarker(number) });
    }
    sessions.push(followSession(journal, runId, number, session));
  };

  for await (const event of handle.stream()) {
    if (event.type !== "status") continue;
    const data = asRecord(event.data);
    const wait = asRecord(data.wait);
    if (data.status === "waiting" && wait.type === "agent" && typeof wait.runId === "string") {
      sessionStarted(wait.runId);
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
  { input, onEvent, onSession, tracker }: Session,
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
    // A session that failed is the goal's to report: it pauses as `session_failed`.
  }
}
