import type { Bot } from "./types";
import type { BotAttentionReason } from "@aven/protocol/types";

export const ATTENTION_ROTATE_MS = 3_800;

export const WORKING_LABEL = "Working";

export const ATTENTION_LABEL: Record<BotAttentionReason, string> = {
  question: "Needs your answer",
  goal: "Goal blocked",
  schedule: "Schedule failed",
  message: "New message",
};

export function attentionBots(
  bots: readonly Bot[],
  working: ReadonlySet<string> = new Set(),
): Bot[] {
  return [...bots]
    .filter((bot) => !bot.isMain && (bot.attention !== null || working.has(bot.id)))
    .sort(
      (a, b) =>
        Number(a.attention === null) - Number(b.attention === null) ||
        Date.parse(a.attention?.since ?? a.createdAt) -
          Date.parse(b.attention?.since ?? b.createdAt) ||
        a.createdAt.localeCompare(b.createdAt),
    );
}

export function attentionQueue(
  bots: readonly Bot[],
  working: ReadonlySet<string> = new Set(),
): Bot[] {
  const main = bots.find((bot) => bot.isMain);
  const waiting = attentionBots(bots, working);
  return main ? [main, ...waiting] : waiting;
}
