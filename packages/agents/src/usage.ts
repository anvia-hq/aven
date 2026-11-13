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

const COMPACTION_MODEL_ID = "compaction";

function contextOfGeneration(generation: {
  modelId?: string;
  usage: Usage;
  contextUsage?: ModelContextUsage;
}): ContextUsage | undefined {
  const known = contextOf(generation.contextUsage);

  if (known) return known;

  if (generation.modelId === COMPACTION_MODEL_ID || generation.usage.inputTokens <= 0) {
    return undefined;
  }

  return { usedTokens: generation.usage.inputTokens };
}

export function usageFromHistory(messages: readonly Message[]): ThreadUsage {
  let totals = NO_USAGE;
  let context: ContextUsage | undefined;
  for (const message of messages) {
    const generation = getAssistantGenerationMetadata(message);

    if (!generation) continue;

    totals = addUsage(totals, tokenUsageOf(generation.usage));
    context = contextOfGeneration(generation) ?? context;
  }
  return { totals, context };
}
