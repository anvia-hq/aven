import { cn } from "cn";

import { isStale, machineMetrics, meterLevel } from "../machine-metrics";
import type { MeterLevel, Runtime } from "../types";
import { noLoadNote } from "./machine-load";

const SEGMENTS = 10;

const lit: Record<MeterLevel, string> = {
  low: "bg-current text-meter-low shadow-[0_0_6px_currentColor]",
  busy: "bg-current text-meter shadow-[0_0_6px_currentColor]",
  high: "bg-current text-destructive shadow-[0_0_6px_currentColor]",
};

const value: Record<MeterLevel, string> = {
  low: "text-foreground",
  busy: "text-meter",
  high: "text-destructive",
};

function Segments({ percent }: { percent: number | null }) {
  const level = meterLevel(percent);
  const filled = percent === null ? 0 : Math.round((percent / 100) * SEGMENTS);
  return (
    <span aria-hidden className="flex h-4 w-full justify-between">
      {Array.from({ length: SEGMENTS }, (_, index) => (
        <span
          key={index}
          className={cn(
            "h-full w-[3px] shrink-0 rounded-full",
            index < filled ? lit[level] : "bg-muted-foreground/20",
          )}
        />
      ))}
    </span>
  );
}

export function MachineGauges({ runtime }: { runtime: Runtime }) {
  const stats = runtime.stats && !isStale(runtime.stats) ? runtime.stats : null;

  if (!runtime.online) return null;

  if (!stats) {
    return (
      <p className="mt-0.5 pl-[18px] font-mono text-[11px] leading-snug tracking-wide text-muted-foreground uppercase">
        {noLoadNote(runtime)}
      </p>
    );
  }

  return (
    <ul className="mt-3.5 grid grid-cols-3 gap-x-6">
      {machineMetrics(stats).map((metric) => (
        <li
          key={metric.key}
          role="meter"
          aria-label={`${metric.label} of ${runtime.name}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={metric.percent ?? undefined}
          aria-valuetext={metric.percent === null ? "unknown" : `${metric.percent}%`}
          data-level={meterLevel(metric.percent)}
          title={`${metric.label}: ${metric.detail}`}
          className="relative flex min-w-0 flex-col gap-1.5 not-first:before:absolute not-first:before:inset-y-0 not-first:before:-left-3 not-first:before:w-px not-first:before:bg-border"
        >
          <span aria-hidden className="font-mono text-[10px] tracking-widest text-muted-foreground">
            {metric.short}
          </span>
          <span
            aria-hidden
            className={cn(
              "font-mono text-lg leading-none font-medium tabular-nums",
              value[meterLevel(metric.percent)],
            )}
          >
            {metric.percent ?? "–"}
            {metric.percent !== null && (
              <span className="ml-0.5 text-[10px] font-normal text-muted-foreground">%</span>
            )}
          </span>
          <Segments percent={metric.percent} />
        </li>
      ))}
    </ul>
  );
}
