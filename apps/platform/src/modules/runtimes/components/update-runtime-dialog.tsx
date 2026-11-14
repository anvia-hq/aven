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

import { useRuntimes } from "../hooks/use-runtimes";
import type { Runtime } from "../types";
import { updateEnd } from "../updating";

export function UpdateRuntimeDialog({ runtime }: { runtime: Runtime }) {
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
    return <Badge variant="outline">Updating…</Badge>;
  }

  if (!canUpdate || !runtime.online || !runtime.updateTo || !runtime.canUpdate) return null;

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
            variant="outline"
            size="sm"
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
