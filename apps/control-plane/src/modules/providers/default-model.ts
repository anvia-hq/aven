import { DEFAULT_MODEL_IDS } from "@aven/agents/model-defaults";
import type { Provider } from "@aven/protocol/runtime-wire";

export const defaultModelId = (provider: Provider): string | undefined =>
  provider === "openai" || provider === "anthropic" || provider === "gemini"
    ? DEFAULT_MODEL_IDS[provider]
    : undefined;
