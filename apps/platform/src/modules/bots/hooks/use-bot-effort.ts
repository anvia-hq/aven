import { useState } from "react";

import type { Bot } from "../types";
import { useBotModel } from "./use-bot-model";
import { useBots } from "./use-bots";

// The reasoning effort of a bot's own model: the levels the model takes, and the one in use (the
// bot's, else the model's own default). A bot on the default model has no levels to offer here.
export function useBotEffort(bot: Bot) {
  const { byProvider, provider, modelId } = useBotModel(bot);
  const { update } = useBots();
  // What was just picked, shown until it is saved, so a slider does not jump back while it moves.
  const [picked, setPicked] = useState<string | null>(null);

  const control = provider && modelId ? byProvider[provider.id]?.efforts[modelId] : undefined;
  const levels = control?.options ?? [];
  const fallback = control?.defaultValue ?? (levels.includes("medium") ? "medium" : levels[0]);
  const saved =
    bot.reasoningEffort && levels.includes(bot.reasoningEffort) ? bot.reasoningEffort : fallback;

  async function choose(level: string) {
    setPicked(level);
    await update(bot, { reasoningEffort: level }, { quiet: true });
    setPicked(null);
  }

  return { levels, effort: picked ?? saved, hasOwnModel: provider !== undefined, choose };
}
