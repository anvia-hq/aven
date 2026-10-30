import { Progress } from "@/components/progress";
import { compactNumber } from "@/lib/format";
import type { ContextUsage } from "@aven/protocol/events";

import { InspectorCard } from "./inspector-card";

// How full the model's context window is, as of its latest call.
export function ContextCard({ context }: { context: ContextUsage | null }) {
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
        <span>{Math.round(percent)}% used</span>
        <span className="text-xs text-muted-foreground">
          {compactNumber(context.usedTokens)} / {compactNumber(context.contextWindow)}
        </span>
      </div>
      <Progress value={percent} aria-label="Context used" />
    </InspectorCard>
  );
}
