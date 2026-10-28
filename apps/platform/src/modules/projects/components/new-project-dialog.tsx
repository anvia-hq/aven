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
import { TextField } from "@/components/text-field";

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
  const { create } = useProjects();
  // Once the user types their own name, picking a different folder shouldn't overwrite it.
  const nameEdited = useRef(false);

  function reset() {
    setName("");
    setProjectPath("");
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
    const project = await create({ name: name.trim(), projectPath });
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
              Point the agent at a directory on the machine running control-plane.
            </DialogDescription>
          </DialogHeader>
          <FolderPicker value={projectPath} onChange={handleFolderChange} />
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
