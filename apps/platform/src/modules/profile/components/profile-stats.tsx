import { compactNumber } from "@/lib/format";

import { spanLabel } from "../activity";
import type { ProfileStats } from "../types";

export function ProfileStats({ stats }: { stats: ProfileStats }) {
  const items = [
    { label: "Threads", value: compactNumber(stats.threads) },
    { label: "Longest thread", value: spanLabel(stats.longestThreadMs) },
    { label: "Longest streak", value: `${stats.longestStreakDays}d` },
    { label: "Current streak", value: `${stats.currentStreakDays}d` },
  ];

  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="flex flex-col gap-1">
          <dt className="text-xs text-muted-foreground">{item.label}</dt>
          <dd className="text-xl font-medium tracking-tight tabular-nums">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
