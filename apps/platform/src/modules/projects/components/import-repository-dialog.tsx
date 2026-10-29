import { Github } from "@mynaui/icons-react";
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
import { useRuntimes } from "@/modules/runtimes/hooks/use-runtimes";

import { useGithub } from "../hooks/use-github";
import { useProjects } from "../hooks/use-projects";
import type { Project } from "../types";

type Props = {
  onImported?: (project: Project) => void;
};

export function ImportRepositoryDialog({ onImported }: Props) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [chosenInstallation, setInstallation] = useState("");
  const [repository, setRepository] = useState("");
  const [runtimeId, setRuntimeId] = useState("");
  const { importRepository } = useProjects();
  const { runtimes, loaded, defaultRunner, refresh: refreshRuntimes } = useRuntimes();

  const {
    status,
    installations: installationList,
    installationId,
    repos,
  } = useGithub(open, chosenInstallation);
  const installations = installationList?.data ?? [];
  const installUrl = status?.data?.installUrl ?? null;
  const stage = stageOf({
    failure: status?.error ?? installationList?.error ?? null,
    configured: status?.data?.configured,
    installationCount: installationList?.data?.length,
    runnerCount: loaded ? runtimes.length : undefined,
  });
  // Until one is picked, offer the default runner.
  const chosenRunner = runtimeId || (defaultRunner?.id ?? "");

  function handleOpenChange(next: boolean) {
    setOpen(next);
    // A runner may have been added or have come online since the list was last loaded.
    if (next) void refreshRuntimes();
    if (!next) {
      setInstallation("");
      setRepository("");
      setRuntimeId("");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!installationId || !repository || !chosenRunner) return;
    setSubmitting(true);
    const project = await importRepository({
      installationId,
      repository,
      runtimeId: chosenRunner,
    });
    setSubmitting(false);
    if (project) {
      handleOpenChange(false);
      onImported?.(project);
    }
  }

  const runners = runtimes.map((runtime) => ({
    value: runtime.id,
    label: runtime.online ? runtime.name : `${runtime.name} (offline)`,
  }));
  const repoOptions = (repos?.data ?? []).map((repo) => ({
    value: repo.fullName,
    label: repo.private ? `${repo.fullName} (private)` : repo.fullName,
  }));

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button />}>
        <Github /> Import repository
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <Form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Import repository</DialogTitle>
            <DialogDescription>
              Every thread in the project gets its own sandbox with a clone of the repository, on
              the runner you choose.
            </DialogDescription>
          </DialogHeader>
          {stage.kind === "ready" ? (
            <>
              <LabeledSelect
                label="GitHub account"
                options={installations.map((entry) => ({
                  value: entry.id,
                  label: entry.accountLogin,
                }))}
                value={installationId}
                onChange={(next) => {
                  setInstallation(next);
                  setRepository("");
                }}
                placeholder="Choose an account"
              />
              {repos?.error ? (
                <p className="text-sm text-destructive">{repos.error}</p>
              ) : (
                <LabeledSelect
                  label="Repository"
                  options={repoOptions}
                  value={repository}
                  onChange={setRepository}
                  placeholder={repos ? "Choose a repository" : "Loading repositories…"}
                />
              )}
              <LabeledSelect
                label="Runner"
                options={runners}
                value={chosenRunner}
                onChange={setRuntimeId}
                placeholder="Choose a runner"
              />
              {installUrl && (
                <a href={installUrl} className="text-sm text-muted-foreground underline">
                  Repository not listed? Add it to the GitHub app
                </a>
              )}
            </>
          ) : (
            <Notice stage={stage} installUrl={installUrl} />
          )}
          <DialogFooter>
            <Button
              type="submit"
              disabled={submitting || !installationId || !repository || !chosenRunner}
            >
              Import
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// What the dialog can show: the form once there is something to pick from, else why not.
type Stage =
  | { kind: "failed"; message: string }
  | { kind: "not-configured" }
  | { kind: "connect" }
  | { kind: "no-runner" }
  | { kind: "ready" };

type StageInput = {
  failure: string | null;
  configured: boolean | undefined;
  /** Undefined until the installations have loaded. */
  installationCount: number | undefined;
  /** Undefined until the runners have loaded. */
  runnerCount: number | undefined;
};

function stageOf({ failure, configured, installationCount, runnerCount }: StageInput): Stage {
  if (failure) return { kind: "failed", message: failure };
  if (configured === false) return { kind: "not-configured" };
  if (installationCount === 0) return { kind: "connect" };
  if (runnerCount === 0) return { kind: "no-runner" };
  return { kind: "ready" };
}

type NoticeProps = {
  stage: Exclude<Stage, { kind: "ready" }>;
  installUrl: string | null;
};

function Notice({ stage, installUrl }: NoticeProps) {
  switch (stage.kind) {
    case "failed":
      return <p className="text-sm text-destructive">{stage.message}</p>;
    case "not-configured":
      return (
        <p className="text-sm text-muted-foreground">
          GitHub is not set up on this control plane. Set the <code>GITHUB_APP_*</code> variables,
          as described in <code>.env.example</code>.
        </p>
      );
    case "connect":
      return (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-muted-foreground">
            Connect a GitHub account to choose from its repositories.
          </p>
          {installUrl && (
            <Button nativeButton={false} render={<a href={installUrl} />}>
              <Github /> Connect GitHub
            </Button>
          )}
        </div>
      );
    case "no-runner":
      return (
        <p className="text-sm text-muted-foreground">
          A project needs a runner to host its sandboxes.{" "}
          <Link to="/settings/runtimes" className="underline">
            Add a runner
          </Link>{" "}
          first.
        </p>
      );
  }
}
