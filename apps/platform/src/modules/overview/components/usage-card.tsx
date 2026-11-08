import { Skeleton } from "@/components/skeleton";
import { compactNumber } from "@/lib/format";

import { OverviewCard } from "./overview-card";
import type { TokenUsage } from "@aven/protocol/types";

export function UsageCard({
  totals,
  loading,
}: {
  totals: TokenUsage | undefined;
  loading: boolean;
}) {
  if (loading) {
    return (
      <OverviewCard title="Usage">
        <div className="flex flex-col gap-1">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="h-4 w-full" />
          ))}
        </div>
        <Skeleton className="h-4 w-40" />
      </OverviewCard>
    );
  }
  if (!totals || totals.inputTokens + totals.outputTokens === 0) return null;

  const uncached = Math.max(
    0,
    totals.inputTokens - totals.cacheWriteTokens - totals.cacheReadTokens,
  );
  const rows = [
    ["Input", totals.inputTokens],
    ["Output", totals.outputTokens],
    ["Cache write", totals.cacheWriteTokens],
    ["Cache read", totals.cacheReadTokens],
    ["Uncached", uncached],
  ] as const;

  return (
    <OverviewCard title="Usage">
      <dl className="flex flex-col gap-1 text-xs">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="tabular-nums">{compactNumber(value)}</dd>
          </div>
        ))}
      </dl>
    </OverviewCard>
  );
}
