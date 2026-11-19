import type { ThreadUsage } from "@aven/protocol/types";

import type { StoredContextSplit } from "./types";

export function withContextSplit(
  usage: ThreadUsage,
  split: StoredContextSplit | null,
): ThreadUsage {
  if (!split || !usage.context || usage.context.usedTokens !== split.usedTokens) return usage;

  return { ...usage, context: { ...usage.context, segments: split.segments } };
}
