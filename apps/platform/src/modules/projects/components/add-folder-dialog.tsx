import { Folder } from "@mynaui/icons-react";
import type { ComponentProps } from "react";

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

import { useAddFolder } from "../hooks/use-add-folder";
import type { Project } from "../types";

type Props = {
  onAdded?: (project: Project) => void;
  variant?: ComponentProps<typeof Button>["variant"];
  size?: ComponentProps<typeof Button>["size"];
};

export function AddFolderDialog({ onAdded, variant, size }: Props) {
  const state = useAddFolder(onAdded);

  return (
    <Dialog open={state.open} onOpenChange={state.handleOpenChange}>
      <DialogTrigger render={<Button variant={variant} size={size} />}>
        <Folder /> Add a folder
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <Form onSubmit={state.handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Add a folder</DialogTitle>
            <DialogDescription>
              A project is a folder on a computer whose runner serves it. A thread works in its own
              copy of the folder, as the person who runs the runner, with that computer's tools.
            </DialogDescription>
          </DialogHeader>
          {state.hasHosts ? (
            <>
              <LabeledSelect
                label="Computer"
                options={state.runners}
                value={state.chosenRunner}
                onChange={state.chooseRunner}
                placeholder="Choose a computer"
              />
              <TextField
                label="Folder"
                value={state.path}
                onChange={(event) => state.setPath(event.target.value)}
                placeholder={state.served[0] ?? "/path/to/the/project"}
              />
              {state.served.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  It serves: {state.served.join(", ")}
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              No computer serves a folder yet. On the computer, run a runner that works on it
              directly and gives the folders it may use: AVEN_SANDBOX=host AVEN_DIRS=/path/to/code.
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={state.submitting || !state.canSubmit}>
              Add
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
