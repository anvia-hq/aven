import { cn } from "cn";

import { linePath, pointsOf } from "@/modules/profile/activity";

import { meterLevel } from "../machine-metrics";
import type { MeterLevel } from "../types";

type Props = {
  points: number[];
  className?: string;
  ariaLabel?: string;
  tone: MeterLevel;
};

const WIDTH = 120;
const HEIGHT = 26;

export const toneClass: Record<MeterLevel, string> = {
  low: "text-meter-low",
  busy: "text-meter",
  high: "text-destructive",
};

export function lineOf(points: number[]) {
  if (points.length === 0) return "";

  if (points.length === 1) return `M0,${HEIGHT - 3} L${WIDTH.toFixed(1)},${HEIGHT - 3}`;

  return linePath(pointsOf(points, WIDTH, HEIGHT));
}

export function RuntimeSparkline({ points, className, ariaLabel, tone }: Props) {
  if (points.length === 0) {
    return <span className={cn("block", className)} aria-hidden={ariaLabel === undefined} />;
  }

  const flat = points.length < 2;

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      role={ariaLabel === undefined ? undefined : "img"}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel === undefined}
      className={cn("block w-full", toneClass[tone], className)}
    >
      <path
        d={lineOf(points)}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        strokeDasharray={flat ? "3 3" : undefined}
        opacity={flat ? 0.5 : 0.85}
      />
    </svg>
  );
}

export function toneOf(percent: number | null): MeterLevel {
  return meterLevel(percent);
}
