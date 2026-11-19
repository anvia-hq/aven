import type { ContextSegmentId } from "./types";

export const CONTEXT_SEGMENT_IDS = [
  "instructions",
  "messages",
  "toolResults",
  "documents",
  "tools",
  "mcpTools",
  "providerTools",
  "outputSchema",
] as const satisfies readonly ContextSegmentId[];
