import { AnthropicClient } from "@anvia/anthropic";
import { defineCompletionModelControls, type CompletionModelControls } from "@anvia/core";
import { AzureOpenAIClient } from "@anvia/azure";
import { GeminiClient } from "@anvia/gemini";
import { OpenAIClient } from "@anvia/openai";
import type { Provider } from "@aven/protocol/runtime-wire";
import { GoogleGenAI } from "@google/genai";

import { DEFAULT_MODEL_IDS } from "./model-defaults";
import { nullFreeStream } from "./null-free-stream";

export type { Provider };

export type ModelConfig = {
  provider: Provider;
  modelId?: string;
  apiKey?: string;
  baseUrl?: string;
  reasoningEffort?: string;
  effortLevels?: readonly string[];
  contextWindow?: number;
};

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

export const azureApiFor = (modelId: string) => (OPENAI_MODEL.test(modelId) ? "responses" : "chat");

export function createModel(config: ModelConfig) {
  if (config.provider === "openai-compatible") {
    if (!config.baseUrl) throw new Error("An OpenAI-compatible provider needs a base URL");
    if (!config.modelId) throw new Error("An OpenAI-compatible provider needs a model id");
    return new OpenAIClient({
      apiKey: config.apiKey || "not-needed",
      baseUrl: config.baseUrl,
    }).completionModel({
      modelId: config.modelId,
      api: "chat",
      controls: controlsFromLevels(config.effortLevels),
      contextLimits: contextLimitsFor(config),
    });
  }

  if (config.provider === "bedrock") {
    if (!config.baseUrl) throw new Error("A Bedrock provider needs its regional endpoint");
    if (!config.modelId) throw new Error("A Bedrock provider needs a model id");
    if (!config.apiKey) throw new Error("A Bedrock provider needs an API key");
    return new OpenAIClient({ apiKey: config.apiKey, baseUrl: config.baseUrl }).completionModel({
      modelId: config.modelId,
      api: "chat",
      controls: controlsFromLevels(config.effortLevels),
      contextLimits: contextLimitsFor(config),
    });
  }

  if (config.provider === "vertex") {
    if (!config.baseUrl) throw new Error("A Vertex AI provider needs its project endpoint");
    if (!config.modelId) throw new Error("A Vertex AI provider needs a model id");
    if (!config.apiKey) throw new Error("A Vertex AI provider needs a credential");
    return new OpenAIClient({ apiKey: config.apiKey, baseUrl: config.baseUrl }).completionModel({
      modelId: config.modelId,
      api: "chat",
      controls: controlsFromLevels(config.effortLevels),
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

  if (config.provider === "gemini") {
    const apiKey = config.apiKey ?? process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
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

  const apiKey = config.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  return new AnthropicClient({ apiKey, baseUrl: config.baseUrl }).completionModel({
    modelId: config.modelId ?? DEFAULT_MODEL_IDS.anthropic,
    controls: controlsFromLevels(config.effortLevels),
    contextLimits: contextLimitsFor(config),
  });
}

export function providerOptionsFor(provider: Provider) {
  return provider === "anthropic" ? { cache_control: { type: "ephemeral" } } : undefined;
}

export type ReasoningControls = { options: readonly string[]; defaultValue: string | null };

export function reasoningControlsFor(
  config: Pick<ModelConfig, "provider" | "modelId" | "effortLevels">,
): ReasoningControls | null {
  if (
    (config.provider === "openai-compatible" ||
      config.provider === "bedrock" ||
      config.provider === "vertex") &&
    (!config.effortLevels?.length || !config.modelId)
  ) {
    return null;
  }
  if (config.provider === "azure" && !config.modelId) return null;
  const controls: CompletionModelControls | undefined = createModel({
    ...config,
    apiKey: "unused",
    baseUrl: "https://unused.invalid/openai/v1",
  }).controls;
  const control = controls?.reasoningEffort;
  return control ? { options: control.options, defaultValue: control.defaultValue ?? null } : null;
}
