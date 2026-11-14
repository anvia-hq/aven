import { createSummaryMemoryCompactor, type CompletionModel } from "@anvia/core";

import { azureApiFor, createModel, providerOptionsFor } from "./model";
import {
  ownedByResponsesApi,
  withAnthropicReasoning,
  withOwnReasoning,
  withoutEmptyAssistantText,
  withoutOutputLimit,
} from "./own-reasoning";
import { withUniqueToolCallIds } from "./unique-tool-call-ids";
import type { ModelConfig, ModelSource } from "./types";

const MODEL_REQUEST_ATTEMPTS = 5;

const COMPACT_AT = 0.7;

const ANTHROPIC_MAX_OUTPUT_TOKENS = 16_000;

export function outputLimitFor(source: ModelSource) {
  return "provider" in source && source.provider === "anthropic"
    ? ANTHROPIC_MAX_OUTPUT_TOKENS
    : undefined;
}

export function summarizerFor(source: ModelSource, model: CompletionModel) {
  const unlimited = !("provider" in source) || source.provider !== "anthropic";
  return {
    model: unlimited ? withoutOutputLimit(model) : model,
    maxTokens: outputLimitFor(source),
  };
}

export function resolveAgentModel(source: ModelSource) {
  const { model, providerOptions, controls } = resolveModel(source);
  return {
    model,
    providerOptions,
    controls,
    maxTokens: outputLimitFor(source),
    retries: { maxAttempts: MODEL_REQUEST_ATTEMPTS },
  };
}

export function compactionFor(
  source: ModelSource,
  model: CompletionModel,
  afterTokens?: number,
  instructions?: string,
) {
  const contextWindow = "contextWindow" in source ? source.contextWindow : undefined;
  const summarizer = summarizerFor(source, model);
  const trigger =
    afterTokens ?? (contextWindow ? Math.floor(contextWindow * COMPACT_AT) : undefined);

  if (!trigger) return undefined;

  return {
    trigger: { afterTokens: trigger },
    compactor: createSummaryMemoryCompactor({
      ...summarizer,
      instructions,
    }),
  };
}

function withHistoryItOwns(model: CompletionModel, config: ModelConfig) {
  if (config.provider === "anthropic") return withAnthropicReasoning(model);

  const responses =
    config.provider === "openai" ||
    (config.provider === "azure" && azureApiFor(config.modelId ?? "") === "responses");
  return responses ? withOwnReasoning(model, ownedByResponsesApi) : model;
}

function resolveModel(source: ModelSource) {
  if ("model" in source)
    return { model: source.model, providerOptions: undefined, controls: undefined };

  return {
    model: withUniqueToolCallIds(
      withoutEmptyAssistantText(withHistoryItOwns(createModel(source, source.apiKey), source)),
    ),
    providerOptions: providerOptionsFor(source.provider),
    controls: source.reasoningEffort ? { reasoningEffort: source.reasoningEffort } : undefined,
  };
}
