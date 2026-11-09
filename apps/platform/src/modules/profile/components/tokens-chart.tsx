import { useId } from "react";

import { compactNumber } from "@/lib/format";

import { areaPath, chartDate, linePath, pointsOf, seriesOf, WINDOW_DAYS } from "../activity";
import type { ProfileDay } from "../types";

const WIDTH = 1000;
const HEIGHT = 220;

type Props = {
  days: ProfileDay[];
  today: string;
  tokens: number;
};

export function TokensChart({ days, today, tokens }: Props) {
  const gradient = `tokens-${useId().replace(/:/g, "")}`;
  const { dates, values } = seriesOf(days, today, WINDOW_DAYS);
  const points = pointsOf(values, WIDTH, HEIGHT);
  const first = dates[0] ?? today;

  return (
    <section aria-label="Tokens" className="flex flex-col gap-5 border-t pt-8">
      <div className="flex flex-col gap-1">
        <h2 className="text-xs text-muted-foreground">Tokens</h2>
        <p className="text-3xl font-semibold tracking-tight tabular-nums">
          {compactNumber(tokens)}{" "}
          <span className="text-lg font-normal text-muted-foreground">tokens</span>
        </p>
      </div>
      {tokens === 0 ? (
        <div className="flex h-48 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
          Your first thread starts this chart.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={`Tokens a day from ${chartDate(first)} to today`}
            className="h-48 w-full text-chart"
          >
            <defs>
              <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity={0.35} />
                <stop offset="100%" stopColor="currentColor" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <path d={areaPath(points, HEIGHT)} fill={`url(#${gradient})`} />
            <path
              d={linePath(points)}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{chartDate(first)}</span>
            <span>Today</span>
          </div>
        </div>
      )}
    </section>
  );
}
