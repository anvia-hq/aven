import { AnthropicClient } from "@anvia/anthropic";
import { OpenAIClient } from "@anvia/openai";

export type Provider = "openai" | "anthropic" | "openai-compatible";

export type ModelConfig = {
  provider: Provider;
  /** Defaults per provider. */
  modelId?: string;
  /** Defaults to `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`. */
  apiKey?: string;
  /** Required for `openai-compatible`: the server's API root, e.g. http://localhost:11434/v1. */
  baseUrl?: string;
};

// `openai-compatible` has no default: every server names its own models.
export const DEFAULT_MODEL_IDS = {
  openai: "gpt-5.6",
  anthropic: "claude-sonnet-5",
} as const satisfies Partial<Record<Provider, string>>;

export function createModel(config: ModelConfig) {
  if (config.provider === "openai-compatible") {
    if (!config.baseUrl) throw new Error("An OpenAI-compatible provider needs a base URL");
    if (!config.modelId) throw new Error("An OpenAI-compatible provider needs a model id");
    // Local servers often need no key, but the client wants a non-empty one. Most of them only
    // implement chat completions, not the Responses API.
    return new OpenAIClient({
      apiKey: config.apiKey || "not-needed",
      baseUrl: config.baseUrl,
    }).completionModel({ modelId: config.modelId, api: "chat" });
  }

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

// Anthropic automatic prompt caching (https://platform.claude.com/docs/en/build-with-claude/prompt-caching):
// one top-level `cache_control` makes the API put the breakpoint on the last cacheable block and
// move it forward as the conversation grows, so each turn of the tool loop reads the prefix
// (tools, system, earlier messages) from cache. Prompts under the model's minimum are simply not
// cached. Only Anthropic's own API takes it; other providers get no extra options.
export function providerOptionsFor(provider: Provider) {
  return provider === "anthropic" ? { cache_control: { type: "ephemeral" } } : undefined;
}
