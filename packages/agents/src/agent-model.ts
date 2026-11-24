import {
  createSummaryMemoryCompactor,
  type AnyTool,
  type CompletionModel,
  type MemoryTokenCounter,
} from "@anvia/core";

import { azureApiFor, createModel } from "./model";
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

const COMPACT_CHARS_PER_TOKEN = 3;

const COMPACT_MEDIA_ESTIMATE_CHARS = 6_000;

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
  const { model, controls } = resolveModel(source);
  return {
    model,
    controls,
    maxTokens: outputLimitFor(source),
    retries: { maxAttempts: MODEL_REQUEST_ATTEMPTS },
  };
}

function boundInlineMedia(this: { type?: unknown } | undefined, key: string, value: unknown) {
  return key === "data" && typeof value === "string" && this?.type === "data"
    ? "x".repeat(Math.min(value.length, COMPACT_MEDIA_ESTIMATE_CHARS))
    : value;
}

function estimateCharsTokens(chars: number) {
  return chars <= 0 ? 0 : Math.ceil(chars / COMPACT_CHARS_PER_TOKEN);
}

export function contextTokenCounter(context?: {
  instructions?: string;
  tools?: readonly AnyTool[];
}): MemoryTokenCounter {
  let overhead: Promise<number> | undefined;
  const fixedTokens = () => {
    if (!overhead) {
      overhead = (async () => {
        let chars = context?.instructions?.length ?? 0;

        if (context?.tools?.length) {
          const definitions = await Promise.all(
            context.tools.map((tool) => Promise.resolve(tool.definition("")).catch(() => null)),
          );
          for (const definition of definitions) {
            if (definition) chars += JSON.stringify(definition).length;
          }
        }

        return estimateCharsTokens(chars);
      })();
    }

    return overhead;
  };

  return async (messages) => {
    if (messages.length === 0) return 0;

    const characters = messages.reduce(
      (total, message) =>
        total +
        JSON.stringify({ role: message.role, content: message.content }, boundInlineMedia).length,
      0,
    );
    return (await fixedTokens()) + Math.max(messages.length, estimateCharsTokens(characters));
  };
}

export function compactionFor(
  source: ModelSource,
  model: CompletionModel,
  afterTokens?: number,
  instructions?: string,
  context?: { instructions?: string; tools?: readonly AnyTool[] },
) {
  const contextWindow = "contextWindow" in source ? source.contextWindow : undefined;
  const summarizer = summarizerFor(source, model);
  const trigger =
    afterTokens ?? (contextWindow ? Math.floor(contextWindow * COMPACT_AT) : undefined);

  if (!trigger) return undefined;

  return {
    trigger: { afterTokens: trigger },
    tokenCounter: contextTokenCounter(context),
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
  if ("model" in source) return { model: source.model, controls: undefined };

  return {
    model: withUniqueToolCallIds(
      withoutEmptyAssistantText(withHistoryItOwns(createModel(source, source.apiKey), source)),
    ),
    controls: source.reasoningEffort ? { reasoningEffort: source.reasoningEffort } : undefined,
  };
}
