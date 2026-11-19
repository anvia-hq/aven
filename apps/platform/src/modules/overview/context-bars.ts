import type { ContextSegmentId, ContextUsage } from "@aven/protocol/types";

const LABELS: Record<ContextSegmentId, string> = {
  instructions: "System prompt",
  tools: "Tool definitions",
  mcpTools: "MCP tools",
  providerTools: "Provider tools",
  outputSchema: "Output schema",
  documents: "Documents",
  messages: "Messages",
  toolResults: "Tool results",
};

const TONES: Record<ContextSegmentId, string> = {
  instructions: "bg-graph-1",
  tools: "bg-graph-2",
  mcpTools: "bg-graph-5",
  providerTools: "bg-foreground/50",
  outputSchema: "bg-foreground/30",
  documents: "bg-graph-6",
  messages: "bg-graph-3",
  toolResults: "bg-graph-4",
};

const ORDER: readonly ContextSegmentId[] = [
  "instructions",
  "tools",
  "mcpTools",
  "providerTools",
  "outputSchema",
  "documents",
  "messages",
  "toolResults",
];

export function contextBars(context: ContextUsage) {
  const window = context.contextWindow;

  if (!window || !context.segments || context.segments.length === 0) return null;

  const bars = ORDER.flatMap((id) => {
    const tokens = context.segments?.find((segment) => segment.id === id)?.tokens ?? 0;
    return tokens > 0
      ? [{ id, label: LABELS[id], tone: TONES[id], tokens, percent: (tokens / window) * 100 }]
      : [];
  });

  return { bars, free: Math.max(0, window - context.usedTokens) };
}
