import { Edit } from "@mynaui/icons-react";
import { useState, type FormEvent } from "react";

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
import { Form } from "@/components/form";
import { Input } from "@/components/input";

import { useRuntimes } from "../hooks/use-runtimes";
import type { Runtime } from "../types";

export function RenameRuntimeDialog({ runtime }: { runtime: Runtime }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(runtime.name);
  const [working, setWorking] = useState(false);
  const { rename } = useRuntimes();
  const trimmed = name.trim();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) setName(runtime.name);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!trimmed || trimmed === runtime.name) return;
    setWorking(true);
    if (await rename(runtime, trimmed)) setOpen(false);
    setWorking(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={<Button variant="ghost" size="icon-sm" aria-label={`Rename ${runtime.name}`} />}
      >
        <Edit />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <Form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Rename runtime</DialogTitle>
            <DialogDescription>
              The name is only a label, shown wherever the runtime is listed or chosen. The runtime
              is not disconnected.
            </DialogDescription>
          </DialogHeader>
          <Input
            aria-label="Runtime name"
            value={name}
            maxLength={100}
            autoFocus
            onChange={(event) => setName(event.target.value)}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={working || !trimmed || trimmed === runtime.name}>
              Save
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
