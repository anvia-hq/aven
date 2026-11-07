import { cn } from "cn";

import { meterLevel } from "../machine-metrics";
import type { MeterLevel } from "../types";

const fill: Record<MeterLevel, string> = {
  low: "bg-meter-low",
  busy: "bg-meter",
  high: "bg-destructive",
};

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
        className={cn("absolute inset-x-0 bottom-0 block", fill[level])}
        style={{ height: `${percent ?? 0}%` }}
      />
    </span>
  );
}
