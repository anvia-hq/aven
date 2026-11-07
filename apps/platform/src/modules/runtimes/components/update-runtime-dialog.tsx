import { useEffect, useRef, useState } from "react";

import { Badge } from "@/components/badge";
import { Button } from "@/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/dialog";

import { useRuntimes } from "../hooks/use-runtimes";
import type { Runtime } from "../types";
import { updateEnd } from "../updating";

// The Update button of a runner that is behind the server, or of the control plane's own runner when GitHub has a newer release (decisions 0146 and 0148), for an owner or an admin,
// with what it will do said first; while it works, the row says Updating. The sidebar's row is
// `compact`; Settings has the plain one.
export function UpdateRuntimeDialog({
  runtime,
  compact = false,
}: {
  runtime: Runtime;
  compact?: boolean;
}) {
  const { canUpdate, update, isUpdating, asked, finishUpdating, updateWaitMs } = useRuntimes();
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);

  const latest = useRef(runtime);
  latest.current = runtime;
  const was = asked(runtime);
  const finished = updateEnd(was, runtime, Date.now()) === "done";
  useEffect(() => {
    if (!was) return;
    if (finished) {
      finishUpdating(latest.current);
      return;
    }
    const timer = setTimeout(
      () => finishUpdating(latest.current),
      Math.max(0, was.at + updateWaitMs - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [was?.at, finished]);

  if (isUpdating(runtime)) {
    return compact ? (
      <span className="shrink-0 px-1 text-[11px] text-muted-foreground">Updating…</span>
    ) : (
      <Badge variant="outline">Updating…</Badge>
    );
  }
  if (!canUpdate || !runtime.online || !runtime.updateTo || !runtime.canUpdate) return null;

  // The control plane's own runner is on the machine that has the server: its update is the whole
  // `aven update` there, which restarts the server too.
  const withServer = runtime.isControlPlane;
  const from = runtime.build ?? "its release";

  async function handleUpdate() {
    setWorking(true);
    if (await update(runtime)) setOpen(false);
    setWorking(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant={compact ? "secondary" : "outline"}
            size={compact ? "xs" : "sm"}
            aria-label={`Update ${runtime.name}`}
            className="shrink-0"
          />
        }
      >
        Update
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <div className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Update {runtime.name}?</DialogTitle>
            <DialogDescription>
              {withServer
                ? `It goes from ${from} to ${runtime.updateTo}, and the server on that machine updates too: Aven is unavailable for a few seconds while it restarts.`
                : `It goes from ${from} to the server's release, ${runtime.updateTo}, and restarts for a moment.`}{" "}
              It will not update while a run is going on it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={working} onClick={() => void handleUpdate()}>
              Update
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
