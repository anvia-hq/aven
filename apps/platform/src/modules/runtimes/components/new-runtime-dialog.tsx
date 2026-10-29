import { Plus } from "@mynaui/icons-react";
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
import { TextField } from "@/components/text-field";

import { RuntimeCommand } from "./runtime-command";
import { useRuntimes } from "../hooks/use-runtimes";
import type { CreatedRuntime } from "../types";

export function NewRuntimeDialog() {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState("");
  const [created, setCreated] = useState<CreatedRuntime | null>(null);
  const { create } = useRuntimes();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setName("");
      setCreated(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setCreated(await create(name.trim()));
    setSubmitting(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button />}>
        <Plus /> Add runtime
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        {created ? (
          <div className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Start {created.runtime.name}</DialogTitle>
              <DialogDescription>
                Run this on the machine you want to use. The token is shown once; if you lose it,
                revoke the runtime and add a new one.
              </DialogDescription>
            </DialogHeader>
            <RuntimeCommand token={created.token} />
            <DialogFooter>
              <Button type="button" onClick={() => handleOpenChange(false)}>
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <Form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Add runtime</DialogTitle>
              <DialogDescription>
                A runtime is a machine that runs agents for this workspace. Everyone in the
                workspace can run threads on it, and those commands run as the user who starts it.
              </DialogDescription>
            </DialogHeader>
            <TextField
              label="Name"
              required
              placeholder="my-laptop"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <DialogFooter>
              <Button type="submit" disabled={submitting || !name.trim()}>
                Add runtime
              </Button>
            </DialogFooter>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
