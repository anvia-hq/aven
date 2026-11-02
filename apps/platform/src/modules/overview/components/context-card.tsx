import type { ContextUsage } from "@aven/protocol/events";

import { Button } from "@/components/button";
import { Progress } from "@/components/progress";
import { Skeleton } from "@/components/skeleton";
import { compactNumber } from "@/lib/format";

import { OverviewCard } from "./overview-card";

// Compacting a thread that has barely begun saves nothing, so the button waits for this share of
// the window (decision 0097).
const COMPACT_FROM_PERCENT = 25;

// How much of the model's window the latest request filled: the whole conversation as it was sent,
// not a running total.
export function ContextCard({
  context,
  loading,
  onCompact,
}: {
  context: ContextUsage | undefined;
  /** The thread's usage is still on its way: the card is drawn with its loaded shape, empty. */
  loading: boolean;
  /**
   * Summarizes the conversation (decision 0097); none for a reader who does not drive the thread.
   * The button is disabled while the agent works, and shows only once a quarter of the window is
   * used. It sits in the card's first row, which has the same height with or without it.
   */
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
