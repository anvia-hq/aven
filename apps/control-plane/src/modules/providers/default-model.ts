import { DEFAULT_MODEL_IDS } from "@aven/agents/model-defaults";
import type { Provider } from "@aven/protocol/runtime-wire";

/** The model a provider runs when none is named. Azure and compatible servers have none: their owner names it. */
export const defaultModelId = (provider: Provider): string | undefined =>
  provider === "openai" || provider === "anthropic" || provider === "gemini"
    ? DEFAULT_MODEL_IDS[provider]
    : undefined;
