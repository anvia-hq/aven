import { useState } from "react";

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

export function UpdateRuntimeDialog({
  runtime,
  compact = false,
}: {
  runtime: Runtime;
  compact?: boolean;
}) {
  const { canUpdate, update, isUpdating } = useRuntimes();
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);

  if (isUpdating(runtime)) {
    return compact ? (
      <span className="shrink-0 px-1 text-[11px] text-muted-foreground">Updating…</span>
    ) : (
      <Badge variant="outline">Updating…</Badge>
    );
  }
  if (!canUpdate || !runtime.online || !runtime.updateTo || !runtime.canUpdate) return null;

  const withServer = runtime.ownerId === null;
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
