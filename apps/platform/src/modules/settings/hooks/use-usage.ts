import { useAtomValue } from "jotai";

import { usageAtom } from "../atoms/usage-atom";

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

export function useUsage(days: number) {
  const points = useAtomValue(usageAtom).slice(-days);
  const tokens = sum(points.map((point) => point.tokens));
  const cost = sum(points.map((point) => point.cost));

  return { points, tokens, cost, averageTokens: tokens / Math.max(points.length, 1) };
}
