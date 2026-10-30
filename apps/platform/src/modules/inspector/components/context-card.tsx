import type { ContextUsage } from "@aven/protocol/events";

import { Progress } from "@/components/progress";
import { compactNumber } from "@/lib/format";

import { InspectorCard } from "./inspector-card";

// How much of the model's window the latest request filled: the whole conversation as it was sent,
// not a running total.
export function ContextCard({ context }: { context: ContextUsage | undefined }) {
  if (!context) {
    return (
      <InspectorCard title="Context">
        <p className="text-muted-foreground">
          Shown after the agent's first reply, when the model's context size is known.
        </p>
      </InspectorCard>
    );
  }

  const percent = Math.min(100, (context.usedTokens / context.contextWindow) * 100);
  return (
    <InspectorCard title="Context">
      <div className="flex items-baseline justify-between">
        <span>{percent < 1 ? "<1" : Math.round(percent)}% used</span>
        <span className="text-xs text-muted-foreground">
          {compactNumber(context.usedTokens)} / {compactNumber(context.contextWindow)}
        </span>
      </div>
      <Progress value={percent} aria-label="Context used" />
      <p className="text-xs text-muted-foreground">Size of the latest request.</p>
    </InspectorCard>
  );
}
