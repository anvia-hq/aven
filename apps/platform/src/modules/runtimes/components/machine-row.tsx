import { Link } from "@tanstack/react-router";
import { cn } from "cn";
import type { CSSProperties } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@aven/ui/tooltip";
import { timeAgo } from "@/lib/format";

import { busiestMetric, isStale, machineMetrics, meterLevel } from "../machine-metrics";
import type { MachineMetric, MeterLevel, Runtime } from "../types";
import { UpdateRuntimeDialog } from "./update-runtime-dialog";

const sandboxesLine = (count: number) =>
  `${count} ${count === 1 ? "sandbox" : "sandboxes"} running`;

function missing(runtime: Runtime) {
  if (!runtime.online) {
    return {
      short: "Offline",
      reason: runtime.lastSeenAt ? `Offline, seen ${timeAgo(runtime.lastSeenAt, true)}` : "Offline",
    };
  }

  if (runtime.stats) {
    return {
      short: "Waiting…",
      reason: `No load reported since ${timeAgo(runtime.stats.reportedAt, true)}: the runner is connected but has stopped saying.`,
    };
  }

  if (runtime.outdated) {
    return {
      short: "Update runner",
      reason:
        "No load reported: this runner is behind the server. Update it with the button, or run aven update on its machine.",
    };
  }

  return { short: "Waiting…", reason: "Waiting for the runner to report its load." };
}

const pill: Record<MeterLevel, string> = {
  low: "bg-meter-low/15",
  busy: "bg-meter/15",
  high: "bg-destructive/15",
};

const dot: Record<MeterLevel, string> = {
  low: "bg-meter-low",
  busy: "bg-meter",
  high: "bg-destructive",
};

function Busiest({ metric, runtime }: { metric: MachineMetric; runtime: Runtime }) {
  const level = meterLevel(metric.percent);
  return (
    <span
      role="meter"
      aria-label={`${metric.label} of ${runtime.name}`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={metric.percent ?? undefined}
      aria-valuetext={metric.percent === null ? "unknown" : `${metric.percent}%`}
      data-slot="machine-busiest"
      data-level={level}
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] tabular-nums",
        pill[level],
      )}
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", dot[level])} />
      <span aria-hidden className="text-[8px] font-medium tracking-wide text-muted-foreground">
        {metric.short}
      </span>
      <span aria-hidden>{metric.percent === null ? "–" : `${metric.percent}%`}</span>
    </span>
  );
}

type Props = { runtime: Runtime; className?: string; style?: CSSProperties };

export function MachineRow({ runtime, className, style }: Props) {
  const stats = runtime.stats && !isStale(runtime.stats) ? runtime.stats : null;
  const metrics = stats ? machineMetrics(stats) : [];
  const busiest = busiestMetric(metrics);
  const gap = missing(runtime);

  return (
    <li
      data-slot="machine-row"
      aria-label={runtime.name}
      style={style}
      className={cn(
        "flex h-8 items-center gap-1 rounded-lg bg-card pr-1 hover:bg-sidebar-accent",
        className,
      )}
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <Link
              to="/settings/runtimes"
              className="flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-lg px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
            />
          }
        >
          <span className="min-w-0 flex-1 truncate">{runtime.name}</span>
          {stats && busiest ? (
            <Busiest metric={busiest} runtime={runtime} />
          ) : (
            <span className="shrink-0 text-[11px] text-muted-foreground">{gap.short}</span>
          )}
        </TooltipTrigger>
        <TooltipContent side="right" className="items-start">
          <div className="flex flex-col gap-0.5">
            <span className="font-medium">{runtime.name}</span>
            {stats ? (
              <>
                {metrics.map((metric) => (
                  <span key={metric.key}>
                    {metric.label}: {metric.percent === null ? "unknown" : `${metric.percent}%`},{" "}
                    {metric.detail}
                  </span>
                ))}
                <span>{sandboxesLine(stats.sandboxes)}</span>
              </>
            ) : (
              <span>{gap.reason}</span>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
      <UpdateRuntimeDialog runtime={runtime} compact />
    </li>
  );
}
