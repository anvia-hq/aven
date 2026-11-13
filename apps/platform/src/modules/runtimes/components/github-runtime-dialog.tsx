import { Github } from "@mynaui/icons-react";
import { useState } from "react";

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
import { LabeledSelect } from "@/components/labeled-select";
import type { RuntimeGithubMode } from "@aven/protocol/types";

import { githubModeNote, GITHUB_MODE_OPTIONS } from "../github-mode";
import { useRuntimes } from "../hooks/use-runtimes";
import type { Runtime } from "../types";

export function GithubRuntimeDialog({ runtime }: { runtime: Runtime }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<RuntimeGithubMode>(runtime.githubMode);
  const [working, setWorking] = useState(false);
  const { setGithubMode } = useRuntimes();

  function handleOpenChange(next: boolean) {
    setOpen(next);

    if (next) setMode(runtime.githubMode);
  }

  async function save() {
    setWorking(true);

    if (await setGithubMode(runtime, mode)) setOpen(false);

    setWorking(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={<Button variant="ghost" size="icon-sm" aria-label={`GitHub of ${runtime.name}`} />}
      >
        <Github />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>GitHub on {runtime.name}</DialogTitle>
          <DialogDescription>
            Which GitHub the runs on this runner act as, for every project.
          </DialogDescription>
        </DialogHeader>
        <LabeledSelect
          label="Runs use"
          options={GITHUB_MODE_OPTIONS}
          value={mode}
          onChange={(next) => setMode(next as RuntimeGithubMode)}
        />
        <p className="text-sm text-muted-foreground">{githubModeNote(mode, runtime.github)}</p>
        <DialogFooter>
          <Button disabled={working || mode === runtime.githubMode} onClick={() => void save()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
