import { Servers, Trash } from "@mynaui/icons-react";
import { cn } from "cn";

import { Badge } from "@aven/ui/badge";
import { Button } from "@aven/ui/button";
import { SettingsEmpty } from "@/components/settings-section";
import { timeAgo } from "@/lib/format";

import { useRuntimes } from "../hooks/use-runtimes";
import { useRuntimeTrend } from "../hooks/use-runtime-trend";
import { isStale, machineMetrics } from "../machine-metrics";
import type { MachineMetric, Runtime } from "../types";
import { MeterBar } from "./meter-bar";
import { RuntimeSparkline, toneOf } from "./runtime-sparkline";
import { githubModeNote } from "../github-mode";
import { GithubRuntimeDialog } from "./github-runtime-dialog";
import { RenameRuntimeDialog } from "./rename-runtime-dialog";
import { RotateRuntimeDialog } from "./rotate-runtime-dialog";
import { UpdateRuntimeDialog } from "./update-runtime-dialog";

function trendDirection(metric: MachineMetric, previous: number | null) {
  if (previous === null || metric.percent === null) return "flat";

  if (metric.percent > previous) return "up";

  if (metric.percent < previous) return "down";

  return "flat";
}

const trendLabel: Record<string, string> = { up: "▲", down: "▼", flat: "–" };

const baselineOf = (percent: number | null) => (percent === null ? [] : [percent]);

function Trend({ metric, previous }: { metric: MachineMetric; previous: number | null }) {
  if (previous === null || metric.percent === null)
    return <span className="text-[10px] font-semibold text-muted-foreground">–</span>;

  const direction = trendDirection(metric, previous);

  return (
    <span
      className={cn(
        "text-[10px] font-semibold",
        direction === "up" && "text-destructive",
        direction === "down" && "text-success",
        direction === "flat" && "text-muted-foreground",
      )}
    >
      {trendLabel[direction]} {Math.abs(metric.percent - previous)}%
    </span>
  );
}

function LoadTile({
  runtime,
  metric,
  history,
  previous,
}: {
  runtime: Runtime;
  metric: MachineMetric;
  history: number[];
  previous: number | null;
}) {
  const points = history.length > 0 ? history : baselineOf(metric.percent);

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
          {metric.short} · {metric.detail}
        </span>
        <Trend metric={metric} previous={previous} />
      </div>
      <div className="mt-1 text-lg font-semibold tracking-tight tabular-nums">
        {metric.percent ?? "–"}
        <span className="text-[11px] font-normal text-muted-foreground">%</span>
      </div>
      <div className="mt-1.5 flex items-end gap-2">
        <MeterBar percent={metric.percent} />
        <RuntimeSparkline
          points={points}
          tone={toneOf(metric.percent)}
          className="h-6 min-w-0 flex-1"
          ariaLabel={`${metric.label} trend of ${runtime.name}`}
        />
      </div>
    </div>
  );
}

function Status({ runtime }: { runtime: Runtime }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
      <span
        role="img"
        aria-label={runtime.online ? "Online" : "Offline"}
        className={cn(
          "size-1.5 rounded-full",
          runtime.online ? "animate-pulse bg-success" : "bg-muted-foreground/50",
        )}
      />
      {runtime.online ? "Online" : "Offline"}
    </span>
  );
}

export function RuntimesList() {
  const { runtimes, loaded, revoke, isOwnedByMe, canRename } = useRuntimes({ poll: true });

  if (!loaded) return null;

  if (runtimes.length === 0) return <SettingsEmpty>No runtimes yet.</SettingsEmpty>;

  return (
    <ul aria-label="Runtimes" className="flex flex-col gap-3">
      {runtimes.map((runtime) => (
        <RuntimeCard
          key={runtime.id}
          runtime={runtime}
          canRename={canRename(runtime)}
          ownedByMe={isOwnedByMe(runtime)}
          onRevoke={() => void revoke(runtime)}
        />
      ))}
    </ul>
  );
}

function RuntimeCard({
  runtime,
  canRename,
  ownedByMe,
  onRevoke,
}: {
  runtime: Runtime;
  canRename: boolean;
  ownedByMe: boolean;
  onRevoke: () => void;
}) {
  const stats = runtime.stats && !isStale(runtime.stats) ? runtime.stats : null;
  const metrics = stats ? machineMetrics(stats) : [];
  const trend = useRuntimeTrend(runtime, metrics);

  return (
    <li aria-label={runtime.name} className="rounded-xl border bg-card/30 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border bg-muted/40">
            <Servers className="size-4 text-muted-foreground" />
          </span>
          <span className="min-w-0">
            <span className="block truncate font-medium">{runtime.name}</span>
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
              <span className="font-mono">{runtime.build ? `v${runtime.build}` : "–"}</span>
              {" · "}
              <span className="whitespace-nowrap">
                {runtime.lastSeenAt ? timeAgo(runtime.lastSeenAt, true) : "Never"}
              </span>
              {stats
                ? ` · ${stats.sandboxes} ${stats.sandboxes === 1 ? "sandbox" : "sandboxes"} running`
                : null}
            </span>
          </span>
        </div>
        <Status runtime={runtime} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {runtime.host && (
          <Badge
            variant="outline"
            title="Works on this computer itself, with no sandbox: the agent runs as the person who runs it"
          >
            This computer
          </Badge>
        )}
        <Badge variant="outline" title={githubModeNote(runtime.githubMode, runtime.github)}>
          {runtime.githubMode === "person" ? "GitHub: each person" : "GitHub: this machine"}
        </Badge>
        {runtime.ownerId === null && (
          <span
            role="img"
            aria-label="Built in"
            title="Built in: the runner of the control plane"
            className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground"
          >
            <Servers className="size-3.5" />
            Built in
          </span>
        )}
        {runtime.updateTo && (
          <Badge variant="outline" title="Update it here, or run `aven update` on that machine">
            Update available
          </Badge>
        )}
      </div>

      {metrics.length > 0 ? (
        <LoadSection
          runtime={runtime}
          metrics={metrics}
          trend={trend}
          sandboxes={stats?.sandboxes ?? null}
        />
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          {runtime.online
            ? "Waiting for the runner to report its load."
            : "Offline: no load to show."}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1">
        <UpdateRuntimeDialog runtime={runtime} />
        {canRename && <GithubRuntimeDialog runtime={runtime} />}
        {canRename && <RenameRuntimeDialog runtime={runtime} />}
        {ownedByMe && (
          <>
            <RotateRuntimeDialog runtime={runtime} />
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Revoke ${runtime.name}`}
              onClick={onRevoke}
            >
              <Trash />
            </Button>
          </>
        )}
      </div>
    </li>
  );
}

type TrendState = {
  history: Record<MachineMetric["key"], number[]>;
  previous: Record<MachineMetric["key"], number | null>;
};

function LoadSection({
  runtime,
  metrics,
  trend,
  sandboxes,
}: {
  runtime: Runtime;
  metrics: MachineMetric[];
  trend: TrendState;
  sandboxes: number | null;
}) {
  return (
    <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-5">
      {metrics.map((metric) => (
        <LoadTile
          key={metric.key}
          runtime={runtime}
          metric={metric}
          history={trend.history[metric.key]}
          previous={trend.previous[metric.key]}
        />
      ))}
      <div>
        <span className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
          Sandbox
        </span>
        <div className="mt-1 text-lg font-semibold tracking-tight tabular-nums">
          {sandboxes ?? "–"}
          <span className="ml-1 text-[11px] font-normal text-muted-foreground">running</span>
        </div>
      </div>
    </div>
  );
}
