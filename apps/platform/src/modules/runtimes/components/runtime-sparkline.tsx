import { useId } from "react";

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

export function areaOf(points: number[]) {
  if (points.length < 2) return "";

  const [first, ...rest] = points;
  const floored = [0, first ?? 0, ...rest];
  const framed = pointsOf(floored, WIDTH, HEIGHT).slice(1);
  const last = framed.at(-1);
  const start = framed[0];

  if (!last || !start) return "";

  return `${linePath(framed)} L${last.x} ${HEIGHT} L${start.x} ${HEIGHT} Z`;
}

export function RuntimeSparkline({ points, className, ariaLabel, tone }: Props) {
  const gradient = `runtime-spark-${useId().replace(/:/g, "")}`;
  const level = tone;

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
      className={cn("block w-full", toneClass[level], className)}
    >
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity={0.35} />
          <stop offset="100%" stopColor="currentColor" stopOpacity={0.02} />
        </linearGradient>
      </defs>
      {!flat && <path d={areaOf(points)} fill={`url(#${gradient})`} />}
      <path
        d={lineOf(points)}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        strokeDasharray={flat ? "3 3" : undefined}
        opacity={flat ? 0.5 : 1}
      />
      {!flat && (
        <circle
          cx={WIDTH}
          cy={pointsOf(points, WIDTH, HEIGHT).at(-1)?.y ?? 0}
          r={2.5}
          fill="currentColor"
        />
      )}
    </svg>
  );
}

export function toneOf(percent: number | null): MeterLevel {
  return meterLevel(percent);
}
