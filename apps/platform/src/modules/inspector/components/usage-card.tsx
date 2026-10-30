import type { TokenUsage } from "@aven/protocol/events";

import { compactNumber } from "@/lib/format";

import { InspectorCard } from "./inspector-card";

// Tokens added up over every model call of the thread. Each call sends the conversation again, so
// this grows far past the context window; the cache rows show how much of that was reused.
export function UsageCard({ totals }: { totals: TokenUsage | undefined }) {
  const total = totals
    ? totals.inputTokens + totals.outputTokens + totals.cacheWriteTokens + totals.cacheReadTokens
    : 0;
  if (!totals || total === 0) return null;

  const rows = [
    ["Input", totals.inputTokens],
    ["Output", totals.outputTokens],
    ["Cache write", totals.cacheWriteTokens],
    ["Cache read", totals.cacheReadTokens],
  ] as const;

  return (
    <InspectorCard title="Usage">
      <dl className="flex flex-col gap-1 text-xs">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="tabular-nums">{compactNumber(value)}</dd>
          </div>
        ))}
        <div className="flex justify-between border-t pt-1">
          <dt className="text-muted-foreground">Total</dt>
          <dd className="tabular-nums">{compactNumber(total)}</dd>
        </div>
      </dl>
      <p className="text-xs text-muted-foreground">Across all model calls in this thread.</p>
    </InspectorCard>
  );
}
