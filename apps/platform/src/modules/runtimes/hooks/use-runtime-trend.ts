import { useRef } from "react";

import type { MachineMetric, MachineMetricKey, Runtime } from "../types";

export const TREND_POINTS = 20;

export type RuntimeTrend = {
  history: Record<MachineMetricKey, number[]>;
  previous: Record<MachineMetricKey, number | null>;
};

export const emptyTrend = (): RuntimeTrend => ({
  history: { cpu: [], memory: [], disk: [] },
  previous: { cpu: null, memory: null, disk: null },
});

export const trendAppend = (
  trail: { reportedAt: string; values: (number | null)[] }[],
  reportedAt: string,
  values: (number | null)[],
): { reportedAt: string; values: (number | null)[] }[] =>
  trail.at(-1)?.reportedAt === reportedAt
    ? trail
    : [...trail, { reportedAt, values }].slice(-TREND_POINTS);

export const trendPrevious = (
  trail: { reportedAt: string; values: (number | null)[] }[],
  index: number,
): number | null => (trail.length > 1 ? (trail.at(-2)?.values[index] ?? null) : null);

export const trendHistory = (values: (number | null | undefined)[]) => {
  const known = values.filter((value): value is number => value !== null && value !== undefined);

  return known.length > 1 ? known : [];
};

type RuntimePoint = { reportedAt: string; values: (number | null)[] };

export function useRuntimeTrend(runtime: Runtime, metrics: MachineMetric[]): RuntimeTrend {
  const seen = useRef(new Map<string, RuntimePoint[]>());

  const statsAt = runtime.stats?.reportedAt ?? null;

  if (metrics.length === 0 || statsAt === null) {
    if (metrics.length === 0) {
      seen.current.delete(runtime.id);
    }

    return emptyTrend();
  }

  const values = metrics.map((metric) => metric.percent);
  const trail = trendAppend(seen.current.get(runtime.id) ?? [], statsAt, values);

  seen.current.set(runtime.id, trail);

  return {
    history: {
      cpu: trendHistory(trail.map((point) => point.values[0])),
      memory: trendHistory(trail.map((point) => point.values[1])),
      disk: trendHistory(trail.map((point) => point.values[2])),
    },
    previous: {
      cpu: trendPrevious(trail, 0),
      memory: trendPrevious(trail, 1),
      disk: trendPrevious(trail, 2),
    },
  };
}
