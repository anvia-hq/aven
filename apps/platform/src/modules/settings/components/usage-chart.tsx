import { format } from "date-fns";

import type { UsagePoint } from "../types";

export function UsageChart({ points }: { points: UsagePoint[] }) {
  const max = Math.max(...points.map((point) => point.tokens), 1);

  return (
    <div
      role="img"
      aria-label={`Daily token usage over ${points.length} days`}
      className="flex h-44 items-end gap-1 rounded-lg border p-4"
    >
      {points.map((point) => (
        <div
          key={point.date}
          title={`${format(new Date(point.date), "MMM d")}: ${point.tokens.toLocaleString()} tokens`}
          className="flex-1 rounded-t bg-primary/70 transition-colors hover:bg-primary"
          style={{ height: `${Math.max(4, (point.tokens / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}
