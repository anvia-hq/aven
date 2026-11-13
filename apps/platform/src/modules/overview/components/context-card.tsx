import { Button } from "@/components/button";
import { Progress } from "@/components/progress";
import { Skeleton } from "@/components/skeleton";
import { compactNumber } from "@/lib/format";

import { OverviewCard } from "./overview-card";
import type { ContextUsage } from "@aven/protocol/types";

const COMPACT_FROM_PERCENT = 25;

export function ContextCard({
  context,
  loading,
  onCompact,
}: {
  context: ContextUsage | undefined;
  loading: boolean;
  onCompact?: { run: () => void; busy: boolean; disabled: boolean };
}) {
  if (loading) {
    return (
      <OverviewCard title="Context">
        <div className="flex min-h-6 items-center justify-between">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-4 w-16" />
        </div>
        <Skeleton className="h-1 w-full" />
      </OverviewCard>
    );
  }

  if (!context) {
    return (
      <OverviewCard title="Context">
        <p className="text-muted-foreground">
          Shown after the agent's first reply, when the model's context size is known.
        </p>
      </OverviewCard>
    );
  }

  if (!context.contextWindow) {
    return (
      <OverviewCard title="Context">
        <div className="flex min-h-6 items-center justify-between gap-2">
          <span>{compactNumber(context.usedTokens)} tokens in context</span>
          <span className="text-xs text-muted-foreground">Model size unknown</span>
        </div>
      </OverviewCard>
    );
  }

  const percent = Math.min(100, (context.usedTokens / context.contextWindow) * 100);
  return (
    <OverviewCard title="Context">
      <div className="flex min-h-6 items-center justify-between gap-2">
        <span>{percent < 1 ? "<1" : Math.round(percent)}% used</span>
        <span className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {compactNumber(context.usedTokens)} / {compactNumber(context.contextWindow)}
          </span>
          {onCompact && percent >= COMPACT_FROM_PERCENT && (
            <Button
              variant="outline"
              size="xs"
              disabled={onCompact.busy || onCompact.disabled}
              onClick={onCompact.run}
            >
              {onCompact.busy ? "Compacting…" : "Compact"}
            </Button>
          )}
        </span>
      </div>
      <Progress value={percent} aria-label="Context used" />
    </OverviewCard>
  );
}
