import { FolderPlus } from "@mynaui/icons-react";
import { Link } from "@tanstack/react-router";
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
import { LabeledSelect } from "@/components/labeled-select";
import { TextField } from "@/components/text-field";
import { useRuntimes } from "@/modules/runtimes/hooks/use-runtimes";

import { useProjects } from "../hooks/use-projects";
import type { Project } from "../types";

type Props = {
  onCreated?: (project: Project) => void;
};

export function NewProjectDialog({ onCreated }: Props) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState("");
  const [runtimeId, setRuntimeId] = useState("");
  const { create } = useProjects();
  const { runtimes, loaded, defaultRunner, refresh: refreshRuntimes } = useRuntimes();
  const runners = runtimes.map((runtime) => ({
    value: runtime.id,
    label: runtime.online ? runtime.name : `${runtime.name} (offline)`,
  }));
  // Until one is picked, offer the default runner.
  const chosen = runtimeId || (defaultRunner?.id ?? "");

  function handleOpenChange(next: boolean) {
    setOpen(next);
    // A runner may have been added or have come online since the list was last loaded.
    if (next) void refreshRuntimes();
    if (!next) {
      setName("");
      setRuntimeId("");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!chosen || !name.trim()) return;
    setSubmitting(true);
    const project = await create({ name: name.trim(), runtimeId: chosen });
    setSubmitting(false);
    if (project) {
      handleOpenChange(false);
      onCreated?.(project);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button />}>
        <FolderPlus /> New project
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <Form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>
              Every thread in a project gets its own sandbox, with an empty workspace, on the runner
              you choose.
            </DialogDescription>
          </DialogHeader>
          <TextField
            label="Name"
            required
            placeholder="my-app"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          {loaded && runtimes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              A project needs a runner to host its sandboxes.{" "}
              <Link to="/settings/runtimes" className="underline">
                Add a runner
              </Link>{" "}
              first.
            </p>
          ) : (
            <LabeledSelect
              label="Runner"
              options={runners}
              value={chosen}
              onChange={setRuntimeId}
              placeholder="Choose a runner"
            />
          )}
          <DialogFooter>
            <Button type="submit" disabled={submitting || !chosen || !name.trim()}>
              Create project
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
