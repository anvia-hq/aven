import { Refresh } from "@mynaui/icons-react";
import { useState } from "react";

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
import type { CreatedRuntime, Runtime } from "../types";
import { RuntimeCommand } from "./runtime-command";

function Rotated({
  runtime,
  rotated,
  onDone,
}: {
  runtime: Runtime;
  rotated: CreatedRuntime;
  onDone: () => void;
}) {
  if (runtime.provider === "boat")
    return (
      <div className="flex flex-col gap-4">
        <DialogHeader>
          <DialogTitle>New token for {runtime.name}</DialogTitle>
          <DialogDescription>
            The old token no longer works. The sandbox reconnects with the new one the next time a
            thread wakes it.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" onClick={onDone}>
            Done
          </Button>
        </DialogFooter>
      </div>
    );

  return (
    <div className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>New token for {runtime.name}</DialogTitle>
        <DialogDescription>
          The old token no longer works. Start the runtime with this command; it is shown once.
        </DialogDescription>
      </DialogHeader>
      <RuntimeCommand token={rotated.token} />
      <DialogFooter>
        <Button type="button" onClick={onDone}>
          Done
        </Button>
      </DialogFooter>
    </div>
  );
}

export function RotateRuntimeDialog({ runtime }: { runtime: Runtime }) {
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [rotated, setRotated] = useState<CreatedRuntime | null>(null);
  const { rotate } = useRuntimes();

  function handleOpenChange(next: boolean) {
    setOpen(next);

    if (!next) setRotated(null);
  }

  async function handleRotate() {
    setWorking(true);
    setRotated(await rotate(runtime));
    setWorking(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button variant="ghost" size="icon-sm" aria-label={`Rotate token for ${runtime.name}`} />
        }
      >
        <Refresh />
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        {rotated ? (
          <Rotated runtime={runtime} rotated={rotated} onDone={() => handleOpenChange(false)} />
        ) : (
          <div className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Rotate token for {runtime.name}?</DialogTitle>
              <DialogDescription>
                The runtime is disconnected now, and any run on it ends. It can only reconnect with
                the new token.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button type="button" disabled={working} onClick={() => void handleRotate()}>
                Rotate token
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
