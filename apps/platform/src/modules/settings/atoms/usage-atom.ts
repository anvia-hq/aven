import { atom } from "jotai";

import type { UsagePoint } from "../types";

// Deterministic mock data so the chart looks the same on every load.
const points: UsagePoint[] = Array.from({ length: 30 }, (_, index) => {
  const date = new Date(Date.now() - (29 - index) * 86_400_000);
  const wave = 0.5 + 0.5 * Math.sin(index / 2.2);
  const tokens = Math.round(120_000 + wave * 380_000 + ((index * 37) % 11) * 9_000);
  return {
    date: date.toISOString(),
    tokens,
    cost: Math.round((tokens / 1_000_000) * 4.2 * 100) / 100,
  };
});

export const usageAtom = atom<UsagePoint[]>(points);
