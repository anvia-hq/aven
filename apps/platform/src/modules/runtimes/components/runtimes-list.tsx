import { Trash } from "@mynaui/icons-react";
import { cn } from "cn";

import { Badge } from "@/components/badge";
import { Button } from "@/components/button";
import { SettingsEmpty } from "@/components/settings-section";
import { timeAgo } from "@/lib/format";

import { useRuntimes } from "../hooks/use-runtimes";
import { isStale, machineMetrics } from "../machine-metrics";
import type { Runtime } from "../types";
import { MeterBar } from "./meter-bar";
import { RotateRuntimeDialog } from "./rotate-runtime-dialog";
import { UpdateRuntimeDialog } from "./update-runtime-dialog";

const head = "px-3 py-2 text-left text-xs font-medium text-muted-foreground";

function Status({ runtime }: { runtime: Runtime }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs">
      <span
        role="img"
        aria-label={runtime.online ? "Online" : "Offline"}
        className={cn(
          "size-2 rounded-full",
          runtime.online ? "bg-success" : "bg-muted-foreground/40",
        )}
      />
      {runtime.online ? "Online" : "Offline"}
    </span>
  );
}

function Load({ runtime }: { runtime: Runtime }) {
  const stats = runtime.stats && !isStale(runtime.stats) ? runtime.stats : null;
  if (!stats) return <span className="text-xs text-muted-foreground">–</span>;
  return (
    <span className="flex items-center gap-2.5">
      {machineMetrics(stats).map((metric) => (
        <span
          key={metric.key}
          role="meter"
          aria-label={`${metric.label} of ${runtime.name}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={metric.percent ?? undefined}
          title={`${metric.label}: ${metric.detail}`}
          className="flex items-center gap-1 text-xs"
        >
          <MeterBar percent={metric.percent} />
          <span className="text-[10px] text-muted-foreground">{metric.short}</span>
          <span className="tabular-nums">{metric.percent ?? "–"}</span>
        </span>
      ))}
    </span>
  );
}

export function RuntimesList() {
  const { runtimes, loaded, revoke, isOwnedByMe } = useRuntimes({ poll: true });

  if (!loaded) return null;
  if (runtimes.length === 0) return <SettingsEmpty>No runtimes yet.</SettingsEmpty>;

  return (
    <div className="overflow-hidden rounded-xl border">
      <table aria-label="Runtimes" className="w-full text-sm">
        <thead className="border-b bg-muted/30">
          <tr>
            <th className={head}>Runtime</th>
            <th className={head}>Status</th>
            <th className={head}>Version</th>
            <th className={head}>Load</th>
            <th className={head}>Last seen</th>
            <th className={cn(head, "w-40")}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {runtimes.map((runtime) => (
            <tr key={runtime.id} aria-label={runtime.name}>
              <td className="px-3 py-3">
                <div className="flex flex-col">
                  <span className="font-medium">{runtime.name}</span>
                  {runtime.ownerId === null && (
                    <span className="text-xs text-muted-foreground">Built in</span>
                  )}
                </div>
              </td>
              <td className="px-3 py-3">
                <Status runtime={runtime} />
              </td>
              <td className="px-3 py-3">
                <span className="flex items-center gap-2 font-mono text-xs">
                  {runtime.build ? `v${runtime.build}` : "–"}
                  {runtime.updateTo && (
                    <Badge
                      variant="outline"
                      title="Update it here, or run `aven update` on that machine"
                    >
                      Update available
                    </Badge>
                  )}
                </span>
              </td>
              <td className="px-3 py-3">
                <Load runtime={runtime} />
              </td>
              <td className="px-3 py-3 text-xs text-muted-foreground">
                {runtime.lastSeenAt ? timeAgo(runtime.lastSeenAt, true) : "Never"}
              </td>
              <td className="px-3 py-3">
                <span className="flex items-center justify-end gap-1">
                  <UpdateRuntimeDialog runtime={runtime} />
                  {isOwnedByMe(runtime) && (
                    <>
                      <RotateRuntimeDialog runtime={runtime} />
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Revoke ${runtime.name}`}
                        onClick={() => void revoke(runtime)}
                      >
                        <Trash />
                      </Button>
                    </>
                  )}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
