import { getAssistantGenerationMetadata, type Message, type Usage } from "@anvia/core";

import { addUsage, NO_USAGE } from "@aven/protocol/events";
import type { ContextUsage, ThreadUsage, TokenUsage } from "@aven/protocol/types";

export function tokenUsageOf(usage: Usage): TokenUsage {
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cacheWriteTokens: usage.cacheCreationInputTokens,
    cacheReadTokens: usage.cachedInputTokens,
  };
}

type ModelContextUsage = {
  usedTokens: number;
  model: { context: { contextWindow: number } };
};

export const contextOf = (usage: ModelContextUsage | undefined): ContextUsage | undefined =>
  usage && { usedTokens: usage.usedTokens, contextWindow: usage.model.context.contextWindow };

export function usageFromHistory(messages: readonly Message[]): ThreadUsage {
  let totals = NO_USAGE;
  let context: ContextUsage | undefined;
  for (const message of messages) {
    const generation = getAssistantGenerationMetadata(message);

    if (!generation) continue;

    totals = addUsage(totals, tokenUsageOf(generation.usage));
    context = contextOf(generation.contextUsage) ?? context;
  }
  return { totals, context };
}
