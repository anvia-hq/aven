import { AnthropicClient } from "@anvia/anthropic";
import { defineCompletionModelControls, type CompletionModelControls } from "@anvia/core";
import { AzureOpenAIClient } from "@anvia/azure";
import { GeminiClient } from "@anvia/gemini";
import { OpenAIClient } from "@anvia/openai";
import { GoogleGenAI } from "@google/genai";

import { DEFAULT_MODEL_IDS } from "./model-defaults";
import { nullFreeStream } from "./null-free-stream";
import type { ModelApiKey, ModelConfig, ReasoningControls } from "./types";

const contextLimitsFor = (config: ModelConfig) =>
  config.contextWindow ? { contextWindow: config.contextWindow } : undefined;

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

const OPENAI_MODEL = /^(gpt-|o\d|chatgpt-|codex)/i;

const ANTHROPIC_PROMPT_CACHE = { ttl: "1h" } as const;

const CHAT_PROVIDERS = {
  "openai-compatible": {
    label: "An OpenAI-compatible provider",
    url: "a base URL",
  },
  bedrock: {
    label: "A Bedrock provider",
    url: "its regional endpoint",
    key: "an API key",
  },
  vertex: {
    label: "A Vertex AI provider",
    url: "its project endpoint",
    key: "a credential",
  },
} as const satisfies Record<string, { label: string; url: string; key?: string }>;

type ChatProvider = keyof typeof CHAT_PROVIDERS;

function isChatProvider(provider: ModelConfig["provider"]): provider is ChatProvider {
  return provider in CHAT_PROVIDERS;
}

function createChatModel(
  config: ModelConfig,
  apiKey: ModelApiKey,
  spec: { label: string; url: string; key?: string },
) {
  if (!config.baseUrl) throw new Error(`${spec.label} needs ${spec.url}`);

  if (!config.modelId) throw new Error(`${spec.label} needs a model id`);

  if (spec.key && !apiKey) throw new Error(`${spec.label} needs ${spec.key}`);

  return new OpenAIClient({
    apiKey: apiKey || "not-needed",
    baseUrl: config.baseUrl,
  }).completionModel({
    modelId: config.modelId,
    api: "chat",
    controls: controlsFromLevels(config.effortLevels),
    contextLimits: contextLimitsFor(config),
  });
}

export const azureApiFor = (modelId: string) => (OPENAI_MODEL.test(modelId) ? "responses" : "chat");

export function createModel(config: ModelConfig, apiKey: ModelApiKey) {
  if (isChatProvider(config.provider)) {
    return createChatModel(config, apiKey, CHAT_PROVIDERS[config.provider]);
  }

  if (config.provider === "azure") {
    if (!config.baseUrl) throw new Error("An Azure provider needs a resource URL");

    if (!config.modelId) throw new Error("An Azure provider needs a deployment name");

    if (!apiKey) throw new Error("An Azure provider needs an API key");

    return new AzureOpenAIClient({
      apiKey,
      baseUrl: config.baseUrl,
      fetch: nullFreeStream(),
    }).completionModel({
      modelId: config.modelId,
      api: azureApiFor(config.modelId),
      controls: controlsFromLevels(config.effortLevels),
      contextLimits: contextLimitsFor(config),
    });
  }

  if (config.provider === "openai") {
    if (!apiKey) throw new Error("An OpenAI provider needs an API key");

    return new OpenAIClient({ apiKey, baseUrl: config.baseUrl }).completionModel({
      modelId: config.modelId ?? DEFAULT_MODEL_IDS.openai,
      api: "responses",
      controls: controlsFromLevels(config.effortLevels),
      contextLimits: contextLimitsFor(config),
    });
  }

  if (config.provider === "gemini") {
    if (!apiKey) throw new Error("A Gemini provider needs an API key");

    const client = new GoogleGenAI({
      apiKey,
      httpOptions: config.baseUrl ? { baseUrl: config.baseUrl } : undefined,
    });
    return new GeminiClient({ client }).completionModel({
      modelId: config.modelId ?? DEFAULT_MODEL_IDS.gemini,
      controls: controlsFromLevels(config.effortLevels),
      contextLimits: contextLimitsFor(config),
    });
  }

  if (config.provider === "anthropic") {
    if (!apiKey) throw new Error("An Anthropic provider needs an API key");

    return new AnthropicClient({ apiKey, baseUrl: config.baseUrl }).completionModel({
      modelId: config.modelId ?? DEFAULT_MODEL_IDS.anthropic,
      promptCache: ANTHROPIC_PROMPT_CACHE,
      controls: controlsFromLevels(config.effortLevels),
      contextLimits: contextLimitsFor(config),
    });
  }

  const unknownProvider: string = config.provider;
  throw new Error(`Unknown model provider "${unknownProvider}"`);
}

export function reasoningControlsFor(
  config: Pick<ModelConfig, "provider" | "modelId" | "effortLevels">,
  defaultEffort?: string | null,
): ReasoningControls | null {
  if (isChatProvider(config.provider) && (!config.effortLevels?.length || !config.modelId)) {
    return null;
  }

  if (config.provider === "azure" && !config.modelId) return null;

  const controls: CompletionModelControls | undefined = createModel(
    {
      ...config,
      baseUrl: "https://unused.invalid/openai/v1",
    },
    "unused",
  ).controls;
  const control = controls?.reasoningEffort;

  if (!control) return null;

  const chosen = defaultEffort && control.options.includes(defaultEffort) ? defaultEffort : null;

  return { options: control.options, defaultValue: chosen ?? control.defaultValue ?? null };
}
