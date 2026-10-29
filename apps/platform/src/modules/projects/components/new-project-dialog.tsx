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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/select";
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
  const { runtimes, loaded } = useRuntimes();
  const runners = runtimes.map((runtime) => ({
    value: runtime.id,
    label: runtime.online ? runtime.name : `${runtime.name} (offline)`,
  }));
  // Until one is picked, offer the first that is online (or the first at all).
  const fallback = (runtimes.find((runtime) => runtime.online) ?? runtimes[0])?.id ?? "";
  const chosen = runtimeId || fallback;

  function handleOpenChange(next: boolean) {
    setOpen(next);
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
            <div className="flex flex-col gap-1 text-sm">
              <span>Runner</span>
              <Select
                items={runners}
                value={chosen}
                onValueChange={(next) => setRuntimeId(next ?? "")}
              >
                <SelectTrigger aria-label="Runner" className="w-full">
                  <SelectValue placeholder="Choose a runner" />
                </SelectTrigger>
                <SelectContent>
                  {runners.map((runner) => (
                    <SelectItem key={runner.value} value={runner.value}>
                      {runner.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
