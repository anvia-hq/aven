import { parseBotPrompt } from "./bots";

export const GOAL_DEFAULT_ROUNDS = 20;
export const GOAL_MAX_ROUNDS = 100;
export const GOAL_OBJECTIVE_MAX = 20_000;
export const GOAL_CHECKS_MAX = 8;
export const GOAL_CHECK_MAX = 4_000;
export const GOAL_REASON_MAX = 2_000;

export const GOAL_ROUND_NOTE_PREFIX = "Goal round ";

export function isGoalRoundNote(prompt: string) {
  const { note, text } = parseBotPrompt(prompt);
  return note === true && text.startsWith(GOAL_ROUND_NOTE_PREFIX);
}
