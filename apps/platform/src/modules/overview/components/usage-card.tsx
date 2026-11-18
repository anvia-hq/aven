import { Skeleton } from "@aven/ui/skeleton";
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
        <div className="flex flex-col gap-2">
          <Skeleton className="h-2 w-full rounded-full" />
          <div className="flex flex-col gap-1">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-4 w-full" />
            ))}
          </div>
        </div>
      </OverviewCard>
    );
  }

  if (!totals || totals.inputTokens + totals.outputTokens === 0) return null;

  const uncached = Math.max(
    0,
    totals.inputTokens - totals.cacheWriteTokens - totals.cacheReadTokens,
  );
  const hitRate =
    totals.inputTokens > 0 ? Math.min(100, (totals.cacheReadTokens / totals.inputTokens) * 100) : 0;
  const rows = [
    { label: "Input", value: compactNumber(totals.inputTokens), tone: null },
    { label: "Output", value: compactNumber(totals.outputTokens), tone: "bg-usage-output" },
    {
      label: "Cache read",
      value: compactNumber(totals.cacheReadTokens),
      tone: "bg-usage-cache-read",
    },
    { label: "Cache hit rate", value: `${hitRate.toFixed(1)}%`, tone: null },
  ] as const;
  const segments = [
    { label: "Output", value: totals.outputTokens, tone: "bg-usage-output" },
    { label: "Cache write", value: totals.cacheWriteTokens, tone: "bg-usage-cache-write" },
    { label: "Cache read", value: totals.cacheReadTokens, tone: "bg-usage-cache-read" },
    { label: "Uncached", value: uncached, tone: "bg-usage-uncached" },
  ] as const;
  const total = segments.reduce((sum, { value }) => sum + value, 0);

  return (
    <OverviewCard title="Usage">
      <div aria-hidden className="flex h-2 w-full gap-px overflow-hidden rounded-full bg-muted">
        {segments.map(({ label, value, tone }) =>
          value > 0 ? (
            <span
              key={label}
              className={tone}
              style={{ width: `${(value / total) * 100}%`, minWidth: 2 }}
            />
          ) : null,
        )}
      </div>
      <dl className="flex flex-col gap-1 text-xs">
        {rows.map(({ label, value, tone }) => (
          <div key={label} className="flex justify-between">
            <dt className="flex items-center gap-2 text-muted-foreground">
              <span
                aria-hidden
                className={`size-2 shrink-0 rounded-full ${tone ?? "border border-foreground/30"}`}
              />
              {label}
            </dt>
            <dd className="tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </OverviewCard>
  );
}
