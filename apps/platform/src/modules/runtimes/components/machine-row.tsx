import { Link } from "@tanstack/react-router";
import { cn } from "cn";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/tooltip";
import { timeAgo } from "@/lib/format";

import { isStale, machineMetrics, type MachineMetric } from "../machine-metrics";
import type { Runtime } from "../types";
import { MeterBar } from "./meter-bar";

const sandboxesLine = (count: number) =>
  `${count} ${count === 1 ? "sandbox" : "sandboxes"} running`;

// What the row says when there is nothing to measure, and the longer reason for the tooltip.
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
      reason: "No load reported: this runner is behind the server, run aven update on its machine.",
    };
  }
  return { short: "Waiting…", reason: "Waiting for the runner to report its load." };
}

function Metric({ metric, runtime }: { metric: MachineMetric; runtime: Runtime }) {
  return (
    <span
      role="meter"
      aria-label={`${metric.label} of ${runtime.name}`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={metric.percent ?? undefined}
      aria-valuetext={metric.percent === null ? "unknown" : `${metric.percent}%`}
      className="flex min-w-0 flex-col gap-1 leading-none"
    >
      <span className="flex items-baseline justify-between">
        <span className="text-[9px] font-medium tracking-wider text-muted-foreground/80">
          {metric.short}
        </span>
        <span className="text-[10px] tabular-nums text-muted-foreground">
          {metric.percent === null ? "–" : `${metric.percent}%`}
        </span>
      </span>
      <MeterBar percent={metric.percent} />
    </span>
  );
}

// One runner as a compact row: whether it is online and its name, and under them CPU, memory and
// disk as three meters of equal width, each with its percentage; the detail behind them is on hover, and a click goes to the runtimes (decision 0091).
export function MachineRow({ runtime }: { runtime: Runtime }) {
  // Numbers from a runner that stopped reporting are not shown as its load now.
  const stats = runtime.stats && !isStale(runtime.stats) ? runtime.stats : null;
  const metrics = stats ? machineMetrics(stats) : [];
  const gap = missing(runtime);

  return (
    <li data-slot="machine-row" aria-label={runtime.name}>
      <Tooltip>
        <TooltipTrigger
          render={
            <Link
              to="/settings/runtimes"
              className="flex w-full flex-col gap-1 rounded-md px-2 py-1.5 text-xs outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring"
            />
          }
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <span
              aria-hidden
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                runtime.online ? "bg-success" : "bg-muted-foreground/40",
              )}
            />
            <span className="min-w-0 flex-1 truncate">{runtime.name}</span>
            {!stats && (
              <span className="shrink-0 text-[11px] text-muted-foreground">{gap.short}</span>
            )}
          </span>
          {stats && (
            <span className="grid grid-cols-3 gap-3 pl-3">
              {metrics.map((metric) => (
                <Metric key={metric.key} metric={metric} runtime={runtime} />
              ))}
            </span>
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
    </li>
  );
}
