import { Link } from "@tanstack/react-router";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/tooltip";
import { timeAgo } from "@/lib/format";

import { isStale, machineMetrics, type MachineMetric } from "../machine-metrics";
import type { Runtime } from "../types";
import { MeterBar } from "./meter-bar";
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

function Metric({ metric, runtime }: { metric: MachineMetric; runtime: Runtime }) {
  return (
    <span
      role="meter"
      aria-label={`${metric.label} of ${runtime.name}`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={metric.percent ?? undefined}
      aria-valuetext={metric.percent === null ? "unknown" : `${metric.percent}%`}
      className="flex shrink-0 items-center gap-[3px]"
    >
      <MeterBar percent={metric.percent} />
      <span className="flex w-[22px] flex-col gap-px leading-none">
        <span className="text-[8px] font-medium tracking-wide text-muted-foreground/80">
          {metric.short}
        </span>
        <span className="text-[10px] tabular-nums">
          {metric.percent ?? "–"}
          {metric.percent !== null && <span className="text-[7px] text-muted-foreground">%</span>}
        </span>
      </span>
    </span>
  );
}

export function MachineRow({ runtime }: { runtime: Runtime }) {
  const stats = runtime.stats && !isStale(runtime.stats) ? runtime.stats : null;
  const metrics = stats ? machineMetrics(stats) : [];
  const gap = missing(runtime);

  return (
    <li
      data-slot="machine-row"
      aria-label={runtime.name}
      className="flex h-8 items-center gap-1 rounded-lg bg-card pr-1 hover:bg-sidebar-accent"
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
          {stats ? (
            <span className="flex shrink-0 items-center gap-1.5">
              {metrics.map((metric) => (
                <Metric key={metric.key} metric={metric} runtime={runtime} />
              ))}
            </span>
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
