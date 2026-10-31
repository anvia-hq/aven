import { Github } from "@mynaui/icons-react";
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

import { useImportRepository } from "../hooks/use-import-repository";
import type { Project } from "../types";
import { ImportRepositoryFields } from "./import-repository-fields";
import { ImportRepositoryNotice } from "./import-repository-notice";

type Props = {
  onImported?: (project: Project) => void;
  variant?: ComponentProps<typeof Button>["variant"];
};

export function ImportRepositoryDialog({ onImported, variant }: Props) {
  const state = useImportRepository(onImported);
  const { stage } = state;

  return (
    <Dialog open={state.open} onOpenChange={state.handleOpenChange}>
      <DialogTrigger render={<Button variant={variant} />}>
        <Github /> Import repository
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <Form onSubmit={state.handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Import repository</DialogTitle>
            <DialogDescription>
              Every thread in the project gets its own sandbox with a clone of the repository, on
              the runner you choose.
            </DialogDescription>
          </DialogHeader>
          {stage.kind === "ready" ? (
            <ImportRepositoryFields state={state} />
          ) : (
            <ImportRepositoryNotice stage={stage} installUrl={state.installUrl} />
          )}
          <DialogFooter>
            <Button type="submit" disabled={state.submitting || !state.canSubmit}>
              Import
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
