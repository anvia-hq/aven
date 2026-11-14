import { Plus } from "@mynaui/icons-react";
import type { ComponentProps } from "react";

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
import { Form } from "@aven/ui/form";
import { Input } from "@aven/ui/input";
import { Label } from "@aven/ui/label";
import { LabeledSelect } from "@aven/ui/labeled-select";
import { Tabs, TabsList, TabsTrigger } from "@aven/ui/tabs";

import { useAddProject } from "../hooks/use-add-project";
import { FolderPicker } from "./folder-picker";
import type { Project } from "../types";

type Props = {
  onAdded?: (project: Project) => void;
  variant?: ComponentProps<typeof Button>["variant"];
  size?: ComponentProps<typeof Button>["size"];
};

export function AddProjectDialog({ onAdded, variant, size }: Props) {
  const state = useAddProject(onAdded);

  return (
    <Dialog open={state.open} onOpenChange={state.handleOpenChange}>
      <DialogTrigger render={<Button variant={variant} size={size} />}>
        <Plus /> Add project
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <Form onSubmit={state.handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Add a project</DialogTitle>
            <DialogDescription>
              A project is a folder on a computer whose runner serves it. A thread works in its own
              copy of it, as the person who runs the runner, with that computer's tools.
            </DialogDescription>
          </DialogHeader>
          {state.hasHosts ? (
            <>
              <Tabs value={state.kind} onValueChange={(next) => state.setKind(next)}>
                <TabsList>
                  <TabsTrigger value="folder">Folder</TabsTrigger>
                  <TabsTrigger value="repository">Repository</TabsTrigger>
                </TabsList>
              </Tabs>
              <LabeledSelect
                label="Computer"
                options={state.runners}
                value={state.chosenRunner}
                onChange={state.chooseRunner}
                placeholder="Choose a computer"
              />
              {state.kind === "folder" ? (
                <FolderPicker
                  key={state.chosenRunner}
                  runtimeId={state.chosenRunner}
                  path={state.path}
                  onChange={state.setPath}
                />
              ) : (
                <div className="flex flex-col gap-1 text-sm">
                  <Label htmlFor="project-repository">Repository</Label>
                  <Input
                    id="project-repository"
                    value={state.repository}
                    onChange={(event) => state.setRepository(event.target.value)}
                    placeholder="owner/name or https://github.com/owner/name"
                    autoFocus
                  />
                  <span className="text-xs text-muted-foreground">
                    The computer clones it once into its own repos folder and keeps it up to date.
                    It uses the git sign-in that computer already has, so a private repository needs
                    that.
                  </span>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              No computer serves a folder yet. On the computer, run a runner that works on it
              directly and gives the folders it may use: AVEN_DIRS=/path/to/code (or aven runner
              install --dir /path/to/code).
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={state.submitting || !state.canSubmit}>
              {state.kind === "folder" ? "Add" : "Clone and add"}
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
