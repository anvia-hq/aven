import {
  IconDeviceDesktop,
  IconFolder,
  IconGitBranch,
  IconLoader2,
  IconPlus,
} from "@tabler/icons-react";
import type { ComponentProps } from "react";

import { Button } from "@aven/ui/button";
import {
  Dialog,
  DialogClose,
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

import { GithubMark } from "@/components/brand-icons";

import { useAddProject } from "../hooks/use-add-project";
import type { Project } from "../types";
import { FolderPicker } from "./folder-picker";
import { GithubRepositoryChoice } from "./github-repository-choice";

type Props = {
  onAdded?: (project: Project) => void;
  variant?: ComponentProps<typeof Button>["variant"];
  size?: ComponentProps<typeof Button>["size"];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

const SOURCE_CARD_CLASS =
  "flex h-auto flex-col items-start gap-2 rounded-xl border border-border/70 bg-muted/25 p-3 text-left font-normal transition-colors hover:border-border hover:bg-muted/50 data-active:border-foreground/25 data-active:bg-accent/70 data-active:shadow-none dark:data-active:border-foreground/20 dark:data-active:bg-foreground/[0.08]";

export function AddProjectDialog({ onAdded, variant, size, open, onOpenChange }: Props) {
  const state = useAddProject(
    onAdded,
    open === undefined ? undefined : { open, onOpenChange: (next) => onOpenChange?.(next) },
  );

  return (
    <Dialog open={state.open} onOpenChange={state.handleOpenChange}>
      {open === undefined && (
        <DialogTrigger render={<Button variant={variant} size={size} />}>
          <IconPlus /> Add project
        </DialogTrigger>
      )}
      <DialogContent className="p-6 sm:max-w-[520px]">
        <Form onSubmit={state.handleSubmit} className="flex flex-col gap-5">
          <DialogHeader className="gap-1.5 pr-6">
            <DialogTitle className="text-base font-semibold tracking-tight">
              Add a project
            </DialogTitle>
            <DialogDescription>
              Connect a GitHub repository, open a local folder, or clone by URL.
            </DialogDescription>
          </DialogHeader>
          <Tabs value={state.kind} onValueChange={(next) => state.setKind(next)}>
            <TabsList className="grid h-auto! w-full grid-cols-3 gap-2.5 bg-transparent p-0">
              <TabsTrigger value="github" className={SOURCE_CARD_CLASS}>
                <span className="flex size-7 items-center justify-center rounded-lg bg-background/80 text-foreground ring-1 ring-border/60">
                  <GithubMark className="size-4" />
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm leading-tight font-medium text-foreground">GitHub</span>
                  <span aria-hidden className="text-xs leading-tight text-muted-foreground">
                    Cloud &amp; runners
                  </span>
                </span>
              </TabsTrigger>
              <TabsTrigger value="folder" className={SOURCE_CARD_CLASS}>
                <span className="flex size-7 items-center justify-center rounded-lg bg-background/80 text-foreground ring-1 ring-border/60">
                  <IconFolder className="size-4" />
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm leading-tight font-medium text-foreground">Folder</span>
                  <span aria-hidden className="text-xs leading-tight text-muted-foreground">
                    Local computer
                  </span>
                </span>
              </TabsTrigger>
              <TabsTrigger value="repository" className={SOURCE_CARD_CLASS}>
                <span className="flex size-7 items-center justify-center rounded-lg bg-background/80 text-foreground ring-1 ring-border/60">
                  <IconGitBranch className="size-4" />
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm leading-tight font-medium text-foreground">Clone</span>
                  <span aria-hidden className="text-xs leading-tight text-muted-foreground">
                    From Git URL
                  </span>
                </span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex h-[340px] flex-col gap-4">
            <ProjectSource state={state} />
          </div>
          <DialogFooter className="-mx-6 -mb-6 mt-1 px-6 py-3.5">
            <DialogClose render={<Button type="button" variant="ghost" />}>Cancel</DialogClose>
            <Button type="submit" disabled={state.submitting || !state.canSubmit}>
              {state.submitting && <IconLoader2 className="animate-spin" />}
              {submitLabel(state)}
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function submitLabel(state: ReturnType<typeof useAddProject>) {
  if (state.kind === "repository") return "Clone and add";

  if (state.kind === "github" && state.githubMode === "new") return "Create and add";

  return "Add";
}

function ProjectSource({ state }: { state: ReturnType<typeof useAddProject> }) {
  if (state.kind === "github") return <GithubRepositoryChoice state={state} />;

  if (!state.hasHosts)
    return (
      <div className="flex flex-col gap-2.5 rounded-xl border border-dashed bg-muted/25 p-4 text-sm">
        <div className="flex items-center gap-2 font-medium text-foreground">
          <IconDeviceDesktop className="size-4 text-muted-foreground" />
          <span>No computer serves a folder yet</span>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Run a runner directly on your machine and expose the folders it may use:
        </p>
        <code className="rounded-md bg-background/80 px-2.5 py-1.5 font-mono text-xs text-foreground ring-1 ring-border/60">
          aven runner install --dir /path/to/code
        </code>
      </div>
    );

  return (
    <>
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
        <div className="flex flex-col gap-1.5 text-sm">
          <Label htmlFor="project-repository">Repository</Label>
          <Input
            id="project-repository"
            value={state.repository}
            onChange={(event) => state.setRepository(event.target.value)}
            placeholder="owner/name or https://github.com/owner/name"
            autoFocus
          />
          <span className="text-xs leading-relaxed text-muted-foreground">
            Cloned once into the computer&apos;s repos folder using its existing Git sign-in.
          </span>
        </div>
      )}
    </>
  );
}
