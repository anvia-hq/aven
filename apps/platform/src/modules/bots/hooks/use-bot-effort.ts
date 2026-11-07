import { useState } from "react";

import type { Bot } from "../types";
import { useBotModel } from "./use-bot-model";
import { useBots } from "./use-bots";

export function useBotEffort(bot: Bot) {
  const { byProvider, provider, modelId } = useBotModel(bot);
  const { update } = useBots();
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
