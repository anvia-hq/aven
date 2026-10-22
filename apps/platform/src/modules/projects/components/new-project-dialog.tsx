import { FolderPlus } from "@mynaui/icons-react";
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

import { useProjects } from "../hooks/use-projects";

export function NewProjectDialog() {
  const [open, setOpen] = useState(false);
  const { create } = useProjects();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    create({ name: String(data.get("name")).trim(), repo: String(data.get("repo")).trim() });
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <FolderPlus /> New project
      </DialogTrigger>
      <DialogContent>
        <Form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>Connect a repository for the agent to work in.</DialogDescription>
          </DialogHeader>
          <TextField label="Name" name="name" required placeholder="my-app" />
          <TextField label="Repository" name="repo" required placeholder="owner/repo" />
          <DialogFooter>
            <Button type="submit">Create project</Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
