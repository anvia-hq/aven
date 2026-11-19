import { Button } from "@aven/ui/button";
import { Skeleton } from "@aven/ui/skeleton";
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
        <Skeleton className="h-2 w-full rounded-full" />
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-3 w-16" />
        </div>
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
          <span>{compactNumber(context.usedTokens)} tokens</span>
          <span className="text-xs text-muted-foreground">in context</span>
        </div>
        <p className="text-xs text-muted-foreground">Model size unknown</p>
      </OverviewCard>
    );
  }

  const percent = Math.min(100, (context.usedTokens / context.contextWindow) * 100);
  return (
    <OverviewCard title="Context">
      <div
        role="progressbar"
        aria-label="Context used"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percent)}
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full rounded-full bg-foreground" style={{ width: `${percent}%` }} />
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span>{percent < 1 ? "<1" : Math.round(percent)}% used</span>
          <span className="text-xs text-muted-foreground">
            {compactNumber(context.usedTokens)} / {compactNumber(context.contextWindow)}
          </span>
        </div>
        {onCompact && percent >= COMPACT_FROM_PERCENT && (
          <Button
            variant="outline"
            size="xs"
            className="rounded-full"
            disabled={onCompact.busy || onCompact.disabled}
            onClick={onCompact.run}
          >
            {onCompact.busy ? "Compacting…" : "Compact"}
          </Button>
        )}
      </div>
    </OverviewCard>
  );
}
