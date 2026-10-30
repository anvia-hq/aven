import type { TokenUsage } from "@aven/protocol/events";

import { compactNumber } from "@/lib/format";

import { InspectorCard } from "./inspector-card";

// Tokens added up over every model call of the thread. Each call sends the conversation again, so
// this grows far past the context window. Cache write and read are parts of the input, not extra.
export function UsageCard({ totals }: { totals: TokenUsage | undefined }) {
  const total = totals ? totals.inputTokens + totals.outputTokens : 0;
  if (!totals || total === 0) return null;

  return (
    <InspectorCard title="Usage">
      <dl className="flex flex-col gap-1 text-xs">
        <Row label="Input" value={totals.inputTokens} />
        <Row label="Cache write" value={totals.cacheWriteTokens} part />
        <Row label="Cache read" value={totals.cacheReadTokens} part />
        <Row label="Output" value={totals.outputTokens} />
        <Row label="Total" value={total} total />
      </dl>
      <p className="text-xs text-muted-foreground">
        Across all model calls in this thread. Cache write and read are part of the input.
      </p>
    </InspectorCard>
  );
}

type RowProps = { label: string; value: number; part?: boolean; total?: boolean };

function Row({ label, value, part, total }: RowProps) {
  return (
    <div className={total ? "flex justify-between border-t pt-1" : "flex justify-between"}>
      <dt className={part ? "pl-3 text-muted-foreground" : "text-muted-foreground"}>{label}</dt>
      <dd className={part ? "text-muted-foreground tabular-nums" : "tabular-nums"}>
        {compactNumber(value)}
      </dd>
    </div>
  );
}
