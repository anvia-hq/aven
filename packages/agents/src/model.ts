import { AnthropicClient } from "@anvia/anthropic";
import { defineCompletionModelControls, type CompletionModelControls } from "@anvia/core";
import { AzureOpenAIClient } from "@anvia/azure";
import { OpenAIClient } from "@anvia/openai";
import type { Provider } from "@aven/protocol/runtime-wire";

import { nullFreeStream } from "./null-free-stream";

export type { Provider };

export type ModelConfig = {
  provider: Provider;
  /** Defaults per provider. For `azure` it is the deployment name, and has no default. */
  modelId?: string;
  /** Defaults to `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`. */
  apiKey?: string;
  /**
   * Required for `openai-compatible` and `azure`: the API root, e.g. http://localhost:11434/v1 or
   * https://my-resource.openai.azure.com/openai/v1.
   * For the other providers it overrides the API root, which is how a runtime reaches the
   * control plane's gateway instead of the vendor.
   */
  baseUrl?: string;
  /** One of the levels `reasoningControlsFor` reports for the model; unsupported values make the run fail. */
  reasoningEffort?: string;
  /**
   * Effort levels for a model the SDK does not know yet, vouched for by the host (for example from
   * models.dev). They replace the SDK's list, so pass them only when `reasoningControlsFor`
   * finds none.
   */
  effortLevels?: readonly string[];
  /** The model's context window in tokens; without it the agent cannot report context usage. */
  contextWindow?: number;
};

// `azure` and `openai-compatible` have no default: every resource and server names its own models.
export const DEFAULT_MODEL_IDS = {
  openai: "gpt-5.6",
  anthropic: "claude-sonnet-5",
} as const satisfies Partial<Record<Provider, string>>;

const contextLimitsFor = (config: ModelConfig) =>
  config.contextWindow ? { contextWindow: config.contextWindow } : undefined;

// Controls for a model the SDK has none for, built from levels the host supplies.
function controlsFromLevels(levels: readonly string[] | undefined) {
  if (!levels?.length) return undefined;
  return defineCompletionModelControls({
    reasoningEffort: {
      type: "select",
      label: "Reasoning effort",
      options: [...levels],
    },
  });
}

// Azure serves OpenAI's models and others (DeepSeek, Grok, ...) from one resource. The Responses
// API streams OpenAI's models, but the others' answers come back whole on it (the stream ends up
// one burst after the wait), while chat completions streams them. A deployment named unlike its
// model is taken for another vendor's, which chat completions also serves.
const OPENAI_MODEL = /^(gpt-|o\d|chatgpt-|codex)/i;

export const azureApiFor = (modelId: string) => (OPENAI_MODEL.test(modelId) ? "responses" : "chat");

export function createModel(config: ModelConfig) {
  if (config.provider === "openai-compatible") {
    if (!config.baseUrl) throw new Error("An OpenAI-compatible provider needs a base URL");
    if (!config.modelId) throw new Error("An OpenAI-compatible provider needs a model id");
    // Local servers often need no key, but the client wants a non-empty one. Most of them only
    // implement chat completions, not the Responses API.
    return new OpenAIClient({
      apiKey: config.apiKey || "not-needed",
      baseUrl: config.baseUrl,
    }).completionModel({
      modelId: config.modelId,
      api: "chat",
      contextLimits: contextLimitsFor(config),
    });
  }

  if (config.provider === "azure") {
    if (!config.baseUrl) throw new Error("An Azure provider needs a resource URL");
    if (!config.modelId) throw new Error("An Azure provider needs a deployment name");
    if (!config.apiKey) throw new Error("An Azure provider needs an API key");
    return new AzureOpenAIClient({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      // Chat completions streams from some vendors carry nulls the SDK rejects (bug 0002).
      fetch: nullFreeStream(),
    }).completionModel({
      modelId: config.modelId,
      api: azureApiFor(config.modelId),
      controls: controlsFromLevels(config.effortLevels),
      contextLimits: contextLimitsFor(config),
    });
  }

  if (config.provider === "openai") {
    const apiKey = config.apiKey ?? process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
    return new OpenAIClient({ apiKey, baseUrl: config.baseUrl }).completionModel({
      modelId: config.modelId ?? DEFAULT_MODEL_IDS.openai,
      api: "responses",
      controls: controlsFromLevels(config.effortLevels),
      contextLimits: contextLimitsFor(config),
    });
  }

  const apiKey = config.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  return new AnthropicClient({ apiKey, baseUrl: config.baseUrl }).completionModel({
    modelId: config.modelId ?? DEFAULT_MODEL_IDS.anthropic,
    controls: controlsFromLevels(config.effortLevels),
    contextLimits: contextLimitsFor(config),
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

export type ReasoningControls = { options: readonly string[]; defaultValue: string | null };

// The reasoning effort levels a model accepts, read from the SDK's own per-model controls, or null
// when it has none (older Anthropic and OpenAI models, and every OpenAI-compatible server, which
// must not be sent a `reasoning_effort` they may reject). Builds the model offline with a
// placeholder key, so nothing leaves the process.
export function reasoningControlsFor(
  config: Pick<ModelConfig, "provider" | "modelId" | "effortLevels">,
): ReasoningControls | null {
  if (config.provider === "openai-compatible") return null;
  if (config.provider === "azure" && !config.modelId) return null;
  const controls: CompletionModelControls | undefined = createModel({
    ...config,
    apiKey: "unused",
    // Nothing is sent: Azure only needs some root to build the client with.
    baseUrl: "https://unused.invalid/openai/v1",
  }).controls;
  const control = controls?.reasoningEffort;
  return control ? { options: control.options, defaultValue: control.defaultValue ?? null } : null;
}
