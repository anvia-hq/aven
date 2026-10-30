import type { TokenUsage } from "@aven/protocol/events";

import { compactNumber } from "@/lib/format";

import { OverviewCard } from "./overview-card";

// Tokens added up over every model call of the thread. Each call sends the conversation again, so
// this grows far past the context window. The cache figures are parts of the input; what is left
// of it is the uncached part.
export function UsageCard({ totals }: { totals: TokenUsage | undefined }) {
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
      <p className="text-xs text-muted-foreground">Across all model calls in this thread.</p>
    </OverviewCard>
  );
}
