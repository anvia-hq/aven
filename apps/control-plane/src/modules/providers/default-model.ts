import { DEFAULT_MODEL_IDS, type Provider } from "@aven/agents/model";

/** The model a provider runs when none is named. Azure and compatible servers have none: their owner names it. */
export const defaultModelId = (provider: Provider): string | undefined =>
  provider === "openai" || provider === "anthropic" ? DEFAULT_MODEL_IDS[provider] : undefined;
