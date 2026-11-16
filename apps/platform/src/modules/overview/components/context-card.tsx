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
      <div className="flex items-center gap-3">
        <ContextRing percent={percent} />
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

const RING_RADIUS = 15;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

function ContextRing({ percent }: { percent: number }) {
  return (
    <svg
      role="progressbar"
      aria-label="Context used"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(percent)}
      viewBox="0 0 36 36"
      className="size-12 shrink-0 -rotate-90"
    >
      <circle
        cx="18"
        cy="18"
        r={RING_RADIUS}
        fill="none"
        strokeWidth="4"
        className="stroke-muted"
      />
      <circle
        cx="18"
        cy="18"
        r={RING_RADIUS}
        fill="none"
        strokeWidth="4"
        strokeLinecap="round"
        className="stroke-foreground"
        strokeDasharray={`${(percent / 100) * RING_LENGTH} ${RING_LENGTH}`}
      />
    </svg>
  );
}
