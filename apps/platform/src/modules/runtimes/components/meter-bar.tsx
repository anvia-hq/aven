import { cn } from "cn";

import { meterLevel, type MeterLevel } from "../machine-metrics";

const fill: Record<MeterLevel, string> = {
  low: "bg-meter-low",
  busy: "bg-meter",
  high: "bg-destructive",
};

// A thin upright bar that fills from the bottom to `percent`, blue, orange past busy and red when
// nearly full; empty for a reading the machine could not give.
export function MeterBar({ percent }: { percent: number | null }) {
  const level = meterLevel(percent);
  return (
    <span
      aria-hidden
      className="relative block h-5 w-1 shrink-0 overflow-hidden rounded-full bg-muted-foreground/20"
    >
      <span
        data-slot="meter-fill"
        data-level={level}
        data-high={level === "high" ? "" : undefined}
        className={cn("absolute inset-x-0 bottom-0 block", fill[level])}
        style={{ height: `${percent ?? 0}%` }}
      />
    </span>
  );
}
