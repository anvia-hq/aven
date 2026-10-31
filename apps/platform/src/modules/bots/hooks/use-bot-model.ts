import { useModelChoices } from "@/modules/providers/hooks/use-model-choices";

import type { Bot } from "../types";

// The model a bot talks with, as the person's providers have it: its provider and the model in
// use (the bot's, else the provider's own). A bot on the default has neither. Everything the
// providers offer comes with it, for whoever shows or changes the choice.
export function useBotModel(bot: Bot) {
  const choices = useModelChoices();
  const provider = choices.providers.find((item) => item.id === bot.providerId);
  const modelId = provider ? (bot.modelId ?? provider.modelId) : null;
  return { ...choices, provider, modelId };
}
