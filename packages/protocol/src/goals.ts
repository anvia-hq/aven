import { parseBotPrompt } from "./bots";

// A goal a bot works on in the background (decision 0068): limits and the shape a bot sees.

/** How many rounds a goal gets unless the bot asks for another number. */
export const GOAL_DEFAULT_ROUNDS = 20;
/** The most rounds a goal may be given. */
export const GOAL_MAX_ROUNDS = 100;
export const GOAL_OBJECTIVE_MAX = 20_000;
export const GOAL_CHECKS_MAX = 8;
export const GOAL_CHECK_MAX = 4_000;
export const GOAL_REASON_MAX = 2_000;

/** Where a goal is: `active` ones get rounds, the rest wait, and a `cleared` one is gone. */
export type GoalPhase = "active" | "paused" | "blocked" | "complete" | "cleared";

/** What a bot does to its goal once it has one. */
export type GoalAction = "complete" | "blocked" | "pause" | "resume" | "clear";

/** A goal as a bot reads it. */
export type BotGoalView = {
  objective: string;
  /** Shell commands, run on the bot's computer, that pass only when the work is done. */
  checks: string[];
  phase: GoalPhase;
  /** Why it stopped, for a blocked goal. */
  blockedReason: string | null;
  /** The rounds started so far. */
  round: number;
  maxRounds: number;
};

/** What a note that starts a round of a goal begins with, so the control plane knows a round when it settles. */
export const GOAL_ROUND_NOTE_PREFIX = "Goal round ";

/** Whether a prompt is the note that starts a round of a goal, which only the app writes. */
export function isGoalRoundNote(prompt: string) {
  const { note, text } = parseBotPrompt(prompt);
  return note === true && text.startsWith(GOAL_ROUND_NOTE_PREFIX);
}
