import { ChevronLeft, ChevronRight } from "@mynaui/icons-react";
import { Link } from "@tanstack/react-router";
import { cn } from "cn";
import { useState } from "react";

import { Button, buttonVariants } from "@/components/button";
import { timeAgo } from "@/lib/format";

import { machineMetrics } from "../machine-metrics";
import type { Runtime } from "../types";
import { SegmentedMeter } from "./segmented-meter";

const sandboxesLine = (count: number) =>
  `${count} ${count === 1 ? "sandbox" : "sandboxes"} running`;

// What a row says when there is nothing to measure: why, and what would change it.
function missingLine(runtime: Runtime) {
  if (!runtime.online) {
    return runtime.lastSeenAt ? `Offline, seen ${timeAgo(runtime.lastSeenAt, true)}` : "Offline";
  }
  return runtime.outdated
    ? "No load reported: this runner is behind the server, run aven update on its machine."
    : "Waiting for the runner to report its load.";
}

// One runner, as a row of its own: how loaded its machine is, with the arrows going through CPU,
// memory and disk, as a monitor of that machine (decision 0091).
export function MachineRow({ runtime }: { runtime: Runtime }) {
  const [selected, setSelected] = useState(0);
  const metrics = runtime.stats ? machineMetrics(runtime.stats) : [];
  const metric = metrics[selected % Math.max(metrics.length, 1)];
  const step = (by: number) => setSelected((selected + by + metrics.length) % metrics.length);

  return (
    <li
      data-slot="machine-row"
      aria-label={runtime.name}
      className="flex flex-col gap-3 rounded-xl border bg-card p-3 text-card-foreground"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden
            className={cn(
              "size-2 shrink-0 rounded-full",
              runtime.online ? "bg-success" : "bg-muted-foreground/40",
            )}
          />
          <span className="truncate text-sm text-muted-foreground" title={runtime.name}>
            {runtime.name}
          </span>
        </div>
        <Link
          to="/settings/runtimes"
          className={buttonVariants({ variant: "outline", size: "xs" })}
        >
          Details
        </Link>
      </div>

      {runtime.stats && metric ? (
        <>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl leading-none font-medium tabular-nums">
              {metric.percent === null ? "–" : `${metric.percent}%`}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {sandboxesLine(runtime.stats.sandboxes)}
            </span>
          </div>
          <SegmentedMeter label={`${metric.label} of ${runtime.name}`} percent={metric.percent} />
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <span className="min-w-12 text-sm text-foreground/80">{metric.label}</span>
              <Button
                variant="outline"
                size="icon-xs"
                aria-label="Previous measure"
                onClick={() => step(-1)}
              >
                <ChevronLeft />
              </Button>
              <Button
                variant="outline"
                size="icon-xs"
                aria-label="Next measure"
                onClick={() => step(1)}
              >
                <ChevronRight />
              </Button>
            </div>
            <span className="truncate text-sm">{metric.detail}</span>
          </div>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">{missingLine(runtime)}</p>
      )}
    </li>
  );
}
