import { createSummaryMemoryCompactor, type CompletionModel } from "@anvia/core";

import { azureApiFor, createModel, providerOptionsFor, type ModelConfig } from "./model";
import {
  ownedByResponsesApi,
  withAnthropicReasoning,
  withOwnReasoning,
  withoutEmptyAssistantText,
  withResponsesToolCallIds,
} from "./own-reasoning";
import { withUniqueToolCallIds } from "./unique-tool-call-ids";

/** Where an agent's model comes from: a provider's config to build it from, or a model already built. */
export type ModelSource = ModelConfig | { model: CompletionModel };

// Model requests that fail transiently (rate limits, dropped connections) are tried this many times.
const MODEL_REQUEST_ATTEMPTS = 5;

// Summarizing starts at this share of the model's context window, leaving room for the next
// request and the summary itself.
const COMPACT_AT = 0.7;

// Anthropic requires a limit on what one reply may write, and Anvia's adapter defaults it to 1,024
// tokens, which cut replies off mid-answer. 16,000 is well above that, and it stays under the
// most the SDK lets a request that is not streamed ask for (about 21,000), since bot replies and
// summaries are not streamed.
const ANTHROPIC_MAX_OUTPUT_TOKENS = 16_000;

// The output limit of a model config's requests: Anthropic's, else none (the provider's default).
export function outputLimitFor(source: ModelSource) {
  return "provider" in source && source.provider === "anthropic"
    ? ANTHROPIC_MAX_OUTPUT_TOKENS
    : undefined;
}

// What every agent takes from its model, whatever else it is: the model, the provider's own
// options, the reasoning effort, the output limit and how a failed request is retried.
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

// Old history is summarized by the agent's own model once it passes the trigger: the size the host
// gave, else 70% of the model's context window. Without either there is nothing to measure
// against, so history is left whole.
export function compactionFor(source: ModelSource, model: CompletionModel, afterTokens?: number) {
  const contextWindow = "contextWindow" in source ? source.contextWindow : undefined;
  const trigger =
    afterTokens ?? (contextWindow ? Math.floor(contextWindow * COMPACT_AT) : undefined);
  if (!trigger) return undefined;
  return {
    trigger: { afterTokens: trigger },
    compactor: createSummaryMemoryCompactor({
      model,
      maxTokens: outputLimitFor(source),
    }),
  };
}

// What an agent's earlier runs left may be another provider's reasoning, or tool calls it issued,
// which this one rejects.
function withHistoryItOwns(model: CompletionModel, config: ModelConfig) {
  if (config.provider === "anthropic") return withAnthropicReasoning(model);
  const responses =
    config.provider === "openai" ||
    (config.provider === "azure" && azureApiFor(config.modelId ?? "") === "responses");
  return responses ? withResponsesToolCallIds(withOwnReasoning(model, ownedByResponsesApi)) : model;
}

// A ready model carries no provider settings; a model config also picks the provider's options
// and the reasoning effort.
function resolveModel(source: ModelSource) {
  if ("model" in source)
    return { model: source.model, providerOptions: undefined, controls: undefined };
  return {
    model: withUniqueToolCallIds(
      withoutEmptyAssistantText(withHistoryItOwns(createModel(source), source)),
    ),
    providerOptions: providerOptionsFor(source.provider),
    controls: source.reasoningEffort ? { reasoningEffort: source.reasoningEffort } : undefined,
  };
}
