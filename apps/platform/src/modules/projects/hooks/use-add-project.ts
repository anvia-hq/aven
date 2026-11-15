import { useState, type FormEvent } from "react";

import { useRuntimes } from "@/modules/runtimes/hooks/use-runtimes";

import type { Project } from "../types";
import { useGithubRepositories } from "./use-github-repositories";
import { useProjects } from "./use-projects";

export function useAddProject(onAdded?: (project: Project) => void) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [runtimeId, setRuntimeId] = useState("");
  const [path, setPath] = useState("");
  const [kind, setKind] = useState<"github" | "folder" | "repository">("github");
  const [githubRepository, setGithubRepository] = useState("");
  const [repository, setRepository] = useState("");
  const { addFolder, addRepository, addGithubRepository } = useProjects();
  const github = useGithubRepositories(open && kind === "github");
  const { runtimes, defaultRunner, refresh: refreshRuntimes } = useRuntimes();

  const hosts = runtimes.filter((runtime) => runtime.directories.length > 0);
  const chosenRunner = runtimeId || (hosts.find((runtime) => runtime.online) ?? hosts[0])?.id || "";
  const canSubmit =
    kind === "github"
      ? Boolean(github.installation && githubRepository)
      : Boolean(
          chosenRunner && (kind === "folder" ? path.startsWith("/") : repository.trim().length > 0),
        );

  function handleOpenChange(next: boolean) {
    setOpen(next);

    if (next) void refreshRuntimes();

    if (!next) {
      setRuntimeId("");
      setPath("");
      setRepository("");
      setGithubRepository("");
      setKind("github");
    }
  }

  function chooseRunner(next: string) {
    setRuntimeId(next);
    setPath("");
  }

  function add() {
    if (kind === "github")
      return addGithubRepository({
        installationId: github.installation,
        repository: githubRepository,
      });

    if (kind === "folder") return addFolder({ runtimeId: chosenRunner, path: path.trim() });

    return addRepository({ runtimeId: chosenRunner, repository: repository.trim() });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSubmit) return;

    setSubmitting(true);
    const project = await add();
    setSubmitting(false);

    if (project) {
      handleOpenChange(false);
      onAdded?.(project);
    }
  }

  return {
    open,
    handleOpenChange,
    handleSubmit,
    submitting,
    canSubmit,
    hasHosts: hosts.length > 0,
    defaultRunnerId: defaultRunner?.id,
    runners: hosts.map((runtime) => ({
      value: runtime.id,
      label: runtime.online ? runtime.name : `${runtime.name} (offline)`,
    })),
    chosenRunner,
    chooseRunner,
    path,
    setPath,
    kind,
    setKind,
    repository,
    setRepository,
    github,
    githubRepository,
    setGithubRepository,
    githubRepositories: github.repositories.map((repo) => ({
      value: repo.fullName,
      label: repo.private ? `${repo.fullName} (private)` : repo.fullName,
    })),
    githubInstallations: github.installations.map((installation) => ({
      value: installation.id,
      label: installation.accountLogin,
    })),
  };
}
