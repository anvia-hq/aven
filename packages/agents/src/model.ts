import { AnthropicClient } from "@anvia/anthropic";
import { OpenAIClient } from "@anvia/openai";

export type Provider = "openai" | "anthropic";

export type ModelConfig = {
  provider: Provider;
  /** Defaults per provider. */
  modelId?: string;
  /** Defaults to `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`. */
  apiKey?: string;
};

export const DEFAULT_MODEL_IDS = {
  openai: "gpt-5.6",
  anthropic: "claude-sonnet-5",
} as const satisfies Record<Provider, string>;

export function createModel(config: ModelConfig) {
  if (config.provider === "openai") {
    const apiKey = config.apiKey ?? process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
    return new OpenAIClient({ apiKey }).completionModel({
      modelId: config.modelId ?? DEFAULT_MODEL_IDS.openai,
      api: "responses",
    });
  }

  const apiKey = config.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  return new AnthropicClient({ apiKey }).completionModel({
    modelId: config.modelId ?? DEFAULT_MODEL_IDS.anthropic,
  });
}
