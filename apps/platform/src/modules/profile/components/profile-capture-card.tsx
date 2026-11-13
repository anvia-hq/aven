import { useId } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/avatar";
import { compactNumber, initials } from "@/lib/format";

import {
  areaPath,
  chartDate,
  handleOf,
  heatmapWeeks,
  levelOf,
  linePath,
  pointsOf,
  seriesOf,
  spanLabel,
  WINDOW_DAYS,
} from "../activity";
import type { ProfileStats } from "../types";

import { LEVELS } from "./activity-heatmap";

export const CAPTURE_WIDTH = 540;
export const CAPTURE_HEIGHT = 675;

const CELL = 6;
const GAP = 2;
const CHART_WIDTH = 1000;
const CHART_HEIGHT = 220;
const CELL_STYLE = { width: CELL, height: CELL };
const GAP_STYLE = { gap: GAP };

type Props = {
  name: string;
  email: string;
  image?: string | null;
  stats: ProfileStats;
};

export function ProfileCaptureCard({ name, email, image, stats }: Props) {
  const gradient = `capture-tokens-${useId().replace(/:/g, "")}`;
  const items = [
    { label: "Threads", value: compactNumber(stats.threads) },
    { label: "Longest thread", value: spanLabel(stats.longestThreadMs) },
    { label: "Longest streak", value: `${stats.longestStreakDays}d` },
    { label: "Current streak", value: `${stats.currentStreakDays}d` },
  ];
  const weeks = heatmapWeeks(stats.days, stats.today);
  const columns = `repeat(${weeks.length}, ${CELL}px)`;
  const most = Math.max(1, ...stats.days.map((day) => day.tokens));
  const { dates, values } = seriesOf(stats.days, stats.today, WINDOW_DAYS);
  const points = pointsOf(values, CHART_WIDTH, CHART_HEIGHT);
  const first = dates[0] ?? stats.today;

  return (
    <div
      className="flex flex-col justify-between overflow-hidden bg-background px-12 py-12 text-foreground"
      style={{ width: CAPTURE_WIDTH, height: CAPTURE_HEIGHT }}
    >
      <div className="flex items-center gap-4">
        <Avatar className="size-16 ring-1 ring-border ring-offset-2 ring-offset-background">
          {image && <AvatarImage src={image} alt="" />}
          <AvatarFallback className="bg-gradient-to-br from-primary/25 to-primary/5 text-lg font-medium text-foreground">
            {initials(name)}
          </AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-col">
          <h2 className="truncate text-2xl font-semibold tracking-tight">{name}</h2>
          <p className="truncate text-sm text-muted-foreground">@{handleOf(name, email)}</p>
        </div>
      </div>

      <dl className="grid grid-cols-4 gap-x-4">
        {items.map((item) => (
          <div key={item.label} className="flex flex-col gap-1">
            <dt className="text-[11px] text-muted-foreground">{item.label}</dt>
            <dd className="text-xl font-bold tracking-tight tabular-nums">{item.value}</dd>
          </div>
        ))}
      </dl>

      <section aria-label="Activity" className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-medium">Activity</h3>
          <p className="text-xs text-muted-foreground">
            {stats.days.length === 0
              ? "No activity yet"
              : `${compactNumber(stats.days.length)} days of work`}
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex" style={GAP_STYLE}>
            <span className="w-2 shrink-0" />
            <div className="grid shrink-0" style={{ ...GAP_STYLE, gridTemplateColumns: columns }}>
              {weeks.map((week, index) => (
                <span
                  key={week.cells[0]?.date ?? index}
                  className="h-2.5 text-[8px] leading-[10px] whitespace-nowrap text-muted-foreground"
                >
                  {week.label}
                </span>
              ))}
            </div>
          </div>
          <div className="flex" style={GAP_STYLE}>
            <div
              className="grid w-2 shrink-0"
              style={{ ...GAP_STYLE, gridTemplateRows: `repeat(7, ${CELL}px)` }}
            />
            <div
              className="grid shrink-0"
              style={{
                ...GAP_STYLE,
                gridTemplateColumns: columns,
                gridTemplateRows: `repeat(7, ${CELL}px)`,
                gridAutoFlow: "column",
              }}
            >
              {weeks.flatMap((week) =>
                week.cells.map((cell, row) =>
                  cell === null ? (
                    <span key={`${week.cells[0]?.date}-${row}`} style={CELL_STYLE} />
                  ) : (
                    <span
                      key={cell.date}
                      style={CELL_STYLE}
                      className={`block rounded-[1px] ${LEVELS[levelOf(cell.tokens, most)] ?? ""}`}
                    />
                  ),
                ),
              )}
            </div>
          </div>
        </div>
      </section>

      <section aria-label="Tokens" className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-medium">Tokens</h3>
          <p className="text-2xl font-semibold tracking-tight tabular-nums">
            {compactNumber(stats.tokens)}{" "}
            <span className="text-sm font-normal text-muted-foreground">tokens</span>
          </p>
        </div>
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`Tokens a day from ${first} to today`}
          className="h-24 w-full text-chart"
        >
          <defs>
            <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity={0.35} />
              <stop offset="100%" stopColor="currentColor" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <path d={areaPath(points, CHART_HEIGHT)} fill={`url(#${gradient})`} />
          <path
            d={linePath(points)}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>{chartDate(first)}</span>
          <span>Today</span>
        </div>
      </section>
    </div>
  );
}
