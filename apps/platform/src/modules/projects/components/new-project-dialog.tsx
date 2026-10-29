import { FolderPlus } from "@mynaui/icons-react";
import { useRef, useState, type FormEvent } from "react";

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
import { FolderPicker } from "./folder-picker";

type Props = {
  onCreated?: (project: Project) => void;
};

export function NewProjectDialog({ onCreated }: Props) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState("");
  const [projectPath, setProjectPath] = useState("");
  // "" is the control plane's own machine.
  const [runtimeId, setRuntimeId] = useState("");
  const { create } = useProjects();
  const { runtimes } = useRuntimes();
  const machines = [
    { value: "", label: "Control plane (this server)" },
    ...runtimes.map((runtime) => ({
      value: runtime.id,
      label: runtime.online ? runtime.name : `${runtime.name} (offline)`,
    })),
  ];
  // Once the user types their own name, picking a different folder shouldn't overwrite it.
  const nameEdited = useRef(false);

  function reset() {
    setName("");
    setProjectPath("");
    setRuntimeId("");
    nameEdited.current = false;
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) reset();
  }

  function handleFolderChange(path: string) {
    setProjectPath(path);
    // Falls back to the full path for the filesystem root, where there's no last segment.
    if (!nameEdited.current) setName(path.split("/").filter(Boolean).at(-1) ?? path);
  }

  function handleNameChange(value: string) {
    nameEdited.current = true;
    setName(value);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!projectPath || !name.trim()) return;
    setSubmitting(true);
    const project = await create({
      name: name.trim(),
      projectPath,
      runtimeId: runtimeId || undefined,
    });
    setSubmitting(false);
    if (project) {
      setOpen(false);
      reset();
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
              Point the agent at a directory on the machine it should run on.
            </DialogDescription>
          </DialogHeader>
          {runtimes.length > 0 && (
            <div className="flex flex-col gap-1 text-sm">
              <span>Machine</span>
              <Select
                items={machines}
                value={runtimeId}
                onValueChange={(next) => {
                  setRuntimeId(next ?? "");
                  // A path on one machine means nothing on another.
                  setProjectPath("");
                }}
              >
                <SelectTrigger aria-label="Machine" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {machines.map((machine) => (
                    <SelectItem key={machine.value} value={machine.value}>
                      {machine.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <FolderPicker
            key={runtimeId}
            value={projectPath}
            onChange={handleFolderChange}
            runtimeId={runtimeId || undefined}
          />
          <TextField
            label="Name"
            required
            placeholder="my-app"
            value={name}
            onChange={(event) => handleNameChange(event.target.value)}
          />
          <DialogFooter>
            <Button type="submit" disabled={submitting || !projectPath || !name.trim()}>
              Create project
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
