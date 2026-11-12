import type { ModelConfig } from "@aven/agents/types";

import { ENV_KEYS } from "./resolve-model";

const PROVIDERS = Object.keys(ENV_KEYS) as ModelConfig["provider"][];

export function serverSmallModel(env: Record<string, string | undefined>): ModelConfig | null {
  const apiKey = env.SMALL_MODEL_API_KEY?.trim();

  if (!apiKey) return null;

  const provider = env.SMALL_MODEL_PROVIDER?.trim() || "anthropic";

  if (!PROVIDERS.includes(provider as ModelConfig["provider"])) {
    throw new Error(
      `SMALL_MODEL_PROVIDER must be one of ${PROVIDERS.join(", ")}, got "${provider}"`,
    );
  }

  const modelId = env.SMALL_MODEL_ID?.trim();

  if (!modelId) {
    throw new Error(
      "SMALL_MODEL_ID is required with SMALL_MODEL_API_KEY: name a small, cheap model",
    );
  }

  return { provider: provider as ModelConfig["provider"], modelId, apiKey };
}
