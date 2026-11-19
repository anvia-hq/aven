import { Skeleton } from "@aven/ui/skeleton";
import { compactNumber } from "@/lib/format";

import { HintedRow } from "./hinted-row";
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
  const hitRate = totals.inputTokens > 0 ? (totals.cacheReadTokens / totals.inputTokens) * 100 : 0;
  const rows = [
    {
      label: "Input",
      value: compactNumber(totals.inputTokens),
      tone: null,
      hint: `${totals.inputTokens.toLocaleString("en")} input tokens added up over every request in this thread. The system prompt and tools are sent again each time, so this is larger than the context.`,
    },
    {
      label: "Output",
      value: compactNumber(totals.outputTokens),
      tone: "bg-usage-output",
      hint: `${totals.outputTokens.toLocaleString("en")} tokens the model wrote, added up over every request.`,
    },
    {
      label: "Cache read",
      value: compactNumber(totals.cacheReadTokens),
      tone: "bg-usage-cache-read",
      hint: `${totals.cacheReadTokens.toLocaleString("en")} input tokens served from the provider's cache, added up over every request.`,
    },
    {
      label: "Uncached",
      value: compactNumber(uncached),
      tone: "bg-usage-uncached",
      hint: `${uncached.toLocaleString("en")} input tokens that were neither read from nor written to the cache.`,
    },
    {
      label: "Cache hit rate",
      value: `${hitRate.toFixed(1)}%`,
      tone: null,
      hint: "Cache read divided by input: the share of all input tokens that came from the cache.",
    },
  ];

  if (totals.cacheWriteTokens > 0)
    rows.splice(3, 0, {
      label: "Cache write",
      value: compactNumber(totals.cacheWriteTokens),
      tone: "bg-usage-cache-write",
      hint: `${totals.cacheWriteTokens.toLocaleString("en")} input tokens written to the provider's cache, added up over every request.`,
    });

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
        {rows.map(({ label, value, tone, hint }) => (
          <HintedRow
            key={label}
            label={label}
            value={value}
            hint={hint}
            marker={
              <span
                aria-hidden
                className={`size-2 shrink-0 rounded-full ${tone ?? "border border-foreground/30"}`}
              />
            }
          />
        ))}
      </dl>
    </OverviewCard>
  );
}
