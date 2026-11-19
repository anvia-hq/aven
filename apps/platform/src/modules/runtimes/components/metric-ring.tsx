import { cn } from "cn";

import { meterLevel } from "../machine-metrics";
import type { MeterLevel } from "../types";

const RADIUS = 20;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const tone: Record<MeterLevel, string> = {
  low: "text-meter-low",
  busy: "text-meter",
  high: "text-destructive",
};

export function ringDashOffset(percent: number | null) {
  const share = percent === null ? 0 : Math.min(100, Math.max(0, percent));

  return CIRCUMFERENCE * (1 - share / 100);
}

export function MetricRing({ percent, className }: { percent: number | null; className?: string }) {
  return (
    <span aria-hidden className={cn("block size-8 shrink-0", tone[meterLevel(percent)], className)}>
      <svg viewBox="0 0 48 48" className="size-full origin-center -rotate-90">
        <circle
          cx="24"
          cy="24"
          r={RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth={2.6}
          className="text-muted-foreground/20"
        />
        <circle
          cx="24"
          cy="24"
          r={RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth={2.6}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={ringDashOffset(percent)}
        />
      </svg>
    </span>
  );
}
