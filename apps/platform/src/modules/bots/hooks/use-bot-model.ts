import { useModelChoices } from "@/modules/providers/hooks/use-model-choices";

import type { Bot } from "../types";

export function useBotModel(bot: Bot) {
  const choices = useModelChoices();
  const provider = choices.providers.find((item) => item.id === bot.providerId);
  const modelId = provider ? (bot.modelId ?? provider.modelId) : null;
  return { ...choices, provider, modelId };
}
