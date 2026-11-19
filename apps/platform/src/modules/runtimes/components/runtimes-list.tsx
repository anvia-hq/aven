import { IconServer, IconTrash } from "@tabler/icons-react";
import { cn } from "cn";

import { Badge } from "@aven/ui/badge";
import { Button } from "@aven/ui/button";
import { SettingsEmpty } from "@/components/settings-section";
import { timeAgo } from "@/lib/format";

import { githubModeNote } from "../github-mode";
import { useRuntimes } from "../hooks/use-runtimes";
import { isStale, machineMetrics } from "../machine-metrics";
import type { MachineMetric, Runtime } from "../types";
import { GithubRuntimeDialog } from "./github-runtime-dialog";
import { MetricRing } from "./metric-ring";
import { RenameRuntimeDialog } from "./rename-runtime-dialog";
import { RotateRuntimeDialog } from "./rotate-runtime-dialog";
import { UpdateRuntimeDialog } from "./update-runtime-dialog";

function loadNote(runtime: Runtime) {
  if (runtime.online) return "Waiting for the runner to report its load.";

  return "Offline: no load to show.";
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

function Metric({ metric, machine }: { metric: MachineMetric; machine: string }) {
  return (
    <div
      role="meter"
      aria-label={`${metric.label} of ${machine}`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={metric.percent ?? undefined}
      aria-valuetext={metric.percent === null ? "unknown" : `${metric.percent}%`}
      className="flex items-center justify-between gap-3 py-2.5 md:px-4 md:py-0 md:first:pl-0 md:last:pr-0"
    >
      <div className="min-w-0">
        <span className="block text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
          {metric.short}
        </span>
        <span className="mt-0.5 block text-xl font-medium tracking-tight tabular-nums">
          {metric.percent ?? "–"}
          {metric.percent === null ? null : (
            <span className="text-xs font-normal text-muted-foreground">%</span>
          )}
        </span>
        <span className="mt-0.5 block max-w-full truncate text-[11px] text-muted-foreground">
          {metric.detail}
        </span>
      </div>
      <MetricRing percent={metric.percent} />
    </div>
  );
}

export function RuntimesList() {
  const { runtimes: all, loaded, revoke, isOwnedByMe, canRename } = useRuntimes({ poll: true });
  const runtimes = all.filter((runtime) => !runtime.isCloud);

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

  return (
    <li aria-label={runtime.name} className="rounded-xl border bg-card/30 p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border bg-muted/40">
          <IconServer className="size-3.5 text-muted-foreground" />
        </span>
        <span className="min-w-0 flex-1">
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

        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
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
              <IconServer className="size-3.5" />
              Built in
            </span>
          )}
          {runtime.updateTo && (
            <Badge variant="outline" title="Update it here, or run `aven update` on that machine">
              Update available
            </Badge>
          )}

          <Status runtime={runtime} />

          <span className="flex items-center gap-1">
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
                  <IconTrash />
                </Button>
              </>
            )}
          </span>
        </div>
      </div>

      {metrics.length > 0 ? (
        <div className="mt-3 grid grid-cols-1 divide-y divide-border border-t pt-3 md:grid-cols-3 md:divide-x md:divide-y-0">
          {metrics.map((metric) => (
            <Metric key={metric.key} metric={metric} machine={runtime.name} />
          ))}
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">{loadNote(runtime)}</p>
      )}
    </li>
  );
}
