import { cn } from "cn";

import { timeAgo } from "@/lib/format";

import { isStale, machineMetrics, meterLevel } from "../machine-metrics";
import type { MeterLevel, Runtime } from "../types";
import { MeterBar } from "./meter-bar";

const text: Record<MeterLevel, string> = {
  low: "text-foreground",
  busy: "text-meter",
  high: "text-destructive",
};

function missing(runtime: Runtime) {
  if (!runtime.online) {
    return runtime.lastSeenAt ? `Offline, seen ${timeAgo(runtime.lastSeenAt, true)}` : "Offline";
  }

  if (runtime.outdated) return "Update the runner to see its load";

  return "Waiting for its load…";
}

export function MachineLoad({ runtime }: { runtime: Runtime }) {
  const stats = runtime.stats && !isStale(runtime.stats) ? runtime.stats : null;

  if (!stats) return <p className="truncate text-xs text-muted-foreground">{missing(runtime)}</p>;

  return (
    <div className="flex flex-col gap-1">
      <ul className="flex items-center gap-3">
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
            className="flex items-center gap-1.5 text-xs tabular-nums"
          >
            <MeterBar percent={metric.percent} />
            <span aria-hidden className="text-[10px] tracking-wide text-muted-foreground">
              {metric.short}
            </span>
            <span aria-hidden className={cn(text[meterLevel(metric.percent)])}>
              {metric.percent === null ? "–" : `${metric.percent}%`}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        {stats.sandboxes} {stats.sandboxes === 1 ? "sandbox" : "sandboxes"} running
      </p>
    </div>
  );
}
