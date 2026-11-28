import { DEFAULT_RELEASES_URL } from "@aven/protocol/release";
import {
  IconCheck,
  IconCircleArrowUp,
  IconCopy,
  IconExternalLink,
  IconServer,
} from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { cn } from "cn";
import { useEffect, useRef, useState } from "react";

import { Badge } from "@aven/ui/badge";
import { Button } from "@aven/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@aven/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@aven/ui/tooltip";
import { useClipboard } from "@aven/ui/use-clipboard";
import { usePlatformConfig } from "@/modules/platform/hooks/use-platform-config";

import { useRuntimes } from "../hooks/use-runtimes";
import type { Runtime } from "../types";
import { summarizeUpdates } from "../update-status";
import { updateEnd } from "../updating";

const UPDATE_COMMAND = "aven update";

function versionStep(from: string | null, to: string | null) {
  if (from && to) return `v${from} → v${to}`;

  if (to) return `v${to}`;

  if (from) return `v${from}`;

  return "";
}

function releaseNotesUrl(version: string | null) {
  return version ? `${DEFAULT_RELEASES_URL}/tag/v${version}` : `${DEFAULT_RELEASES_URL}/latest`;
}

function UpdateCommandBox() {
  const { copied, copy } = useClipboard();

  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/50 px-3 py-2">
      <code className="font-mono text-xs text-foreground">{UPDATE_COMMAND}</code>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs"
        onClick={() => void copy(UPDATE_COMMAND)}
      >
        {copied ? <IconCheck className="size-3.5" /> : <IconCopy className="size-3.5" />}
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

function RunnerUpdateRow({
  runtime,
  canUpdate,
  updating,
  working,
  onUpdate,
}: {
  runtime: Runtime;
  canUpdate: boolean;
  updating: boolean;
  working: boolean;
  onUpdate: (runtime: Runtime) => void;
}) {
  const canSelfUpdate =
    canUpdate && runtime.online && runtime.canUpdate && Boolean(runtime.updateTo);
  const step = versionStep(runtime.build, runtime.updateTo);

  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <IconServer className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{runtime.name}</div>
          {step && (
            <div className="truncate font-mono text-xs text-muted-foreground tabular-nums">
              {step}
            </div>
          )}
        </div>
      </div>
      <div className="shrink-0">
        {updating && <Badge variant="outline">Updating…</Badge>}
        {!updating && canSelfUpdate && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={working}
            onClick={() => onUpdate(runtime)}
          >
            Update
          </Button>
        )}
        {!updating && !canSelfUpdate && (
          <span className="font-mono text-xs text-muted-foreground">
            {runtime.online ? UPDATE_COMMAND : "Offline"}
          </span>
        )}
      </div>
    </div>
  );
}

export function UpdateRailButton() {
  const { config } = usePlatformConfig();
  const { runtimes, canUpdate, update, isUpdating, asked, finishUpdating, updateWaitMs } =
    useRuntimes();
  const [open, setOpen] = useState(false);
  const [workingId, setWorkingId] = useState<string | null>(null);

  const askedRef = useRef(asked);
  askedRef.current = asked;
  const finishRef = useRef(finishUpdating);
  finishRef.current = finishUpdating;
  const runtimesRef = useRef(runtimes);
  runtimesRef.current = runtimes;

  const activeWatchKey = runtimes
    .flatMap((runtime) => {
      const was = asked(runtime);
      return was ? [`${runtime.id}:${was.at}:${runtime.online}:${runtime.build ?? ""}`] : [];
    })
    .join("|");

  useEffect(() => {
    if (!activeWatchKey) return;

    const timers: ReturnType<typeof setTimeout>[] = [];
    const now = Date.now();

    for (const runtime of runtimesRef.current) {
      const was = askedRef.current(runtime);

      if (!was) continue;

      if (updateEnd(was, runtime, now) === "done") {
        finishRef.current(runtime);
        continue;
      }

      timers.push(
        setTimeout(
          () => {
            const current = runtimesRef.current.find((item) => item.id === runtime.id);

            if (current) finishRef.current(current);
          },
          Math.max(0, was.at + updateWaitMs - now),
        ),
      );
    }

    return () => {
      for (const timer of timers) clearTimeout(timer);
    };
  }, [activeWatchKey, updateWaitMs]);

  const summary = summarizeUpdates({ config, runtimes, isUpdating });

  if (!summary) return null;

  const serverRuntime = summary.server?.runtime;
  const serverUpdating = Boolean(serverRuntime && isUpdating(serverRuntime));
  const canSelfUpdateServer = Boolean(
    serverRuntime &&
    canUpdate &&
    serverRuntime.online &&
    serverRuntime.canUpdate &&
    serverRuntime.updateTo,
  );
  const serverStep = summary.server ? versionStep(summary.server.from, summary.server.to) : "";
  const notesUrl = releaseNotesUrl(summary.targetVersion);

  async function handleUpdate(runtime: Runtime) {
    setWorkingId(runtime.id);
    await update(runtime);
    setWorkingId(null);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger
          render={
            <DialogTrigger
              render={
                <Button
                  variant="ghost"
                  aria-label={summary.tooltip}
                  className="relative flex size-9 shrink-0 items-center justify-center rounded-xl p-0 text-muted-foreground outline-none transition-[color,background-color,transform] duration-200 hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-(--chrome) active:scale-95 motion-reduce:transition-none"
                />
              }
            />
          }
        >
          <IconCircleArrowUp className="size-[17px]" />
          <span
            aria-hidden="true"
            className={cn(
              "absolute top-1.5 right-1.5 size-1.5 rounded-full bg-info",
              summary.updating && "animate-pulse",
            )}
          />
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={10}>
          {summary.tooltip}
        </TooltipContent>
      </Tooltip>

      <DialogContent className="sm:max-w-md">
        <div className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{summary.updating ? "Updating Aven" : "Update available"}</DialogTitle>
            <DialogDescription>
              {summary.server
                ? `A new version of Aven${serverStep ? ` (${serverStep})` : ""} is available.`
                : "One or more connected computers are running an older release of Aven."}
            </DialogDescription>
          </DialogHeader>

          {summary.server && (
            <div className="flex flex-col gap-3">
              {serverUpdating && (
                <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-sm">
                  <span className="text-muted-foreground">
                    Restarting Aven with the new release. It will be back in a few seconds.
                  </span>
                  <Badge variant="outline" className="shrink-0">
                    Updating…
                  </Badge>
                </div>
              )}

              {!serverUpdating && canSelfUpdateServer && (
                <p className="text-sm text-muted-foreground">
                  Updating restarts Aven for a few seconds. It will not update while a run is going
                  on the server.
                </p>
              )}

              {!serverUpdating && !canSelfUpdateServer && (
                <div className="flex flex-col gap-2">
                  <p className="text-sm text-muted-foreground">
                    {canUpdate
                      ? "This server cannot update itself from the browser. Run this command on the server machine:"
                      : "Ask a workspace owner or admin to update, or run this command on the server machine:"}
                  </p>
                  <UpdateCommandBox />
                </div>
              )}
            </div>
          )}

          {summary.runners.length > 0 && (
            <div className="flex flex-col gap-1">
              {summary.server && (
                <div className="text-xs font-medium text-muted-foreground">Connected computers</div>
              )}
              <div className="divide-y divide-border rounded-lg border px-3">
                {summary.runners.map((runtime) => (
                  <RunnerUpdateRow
                    key={runtime.id}
                    runtime={runtime}
                    canUpdate={canUpdate}
                    updating={isUpdating(runtime)}
                    working={workingId === runtime.id}
                    onUpdate={(target) => void handleUpdate(target)}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <a
              href={notesUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 underline-offset-4 hover:text-foreground hover:underline"
            >
              Release notes
              <IconExternalLink className="size-3" aria-hidden />
            </a>
            {summary.runners.length > 0 && (
              <Link
                to="/settings/runtimes"
                className="underline-offset-4 hover:text-foreground hover:underline"
                onClick={() => setOpen(false)}
              >
                Manage computers
              </Link>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Close
            </Button>
            {!serverUpdating && canSelfUpdateServer && serverRuntime && (
              <Button
                type="button"
                disabled={workingId === serverRuntime.id}
                onClick={() => void handleUpdate(serverRuntime)}
              >
                Update now
              </Button>
            )}
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
