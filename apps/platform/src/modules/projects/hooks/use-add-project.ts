import { useState, type FormEvent } from "react";

import { useRuntimes } from "@/modules/runtimes/hooks/use-runtimes";

import type { Project } from "../types";
import { useGithubRepositories } from "./use-github-repositories";
import { useProjects } from "./use-projects";

const REPOSITORY_NAME = /^[A-Za-z0-9._-]+$/;
const MAX_REPOSITORY_NAME = 100;

export function useAddProject(
  onAdded?: (project: Project) => void,
  control?: { open: boolean; onOpenChange: (open: boolean) => void },
) {
  const [innerOpen, setInnerOpen] = useState(false);
  const open = control?.open ?? innerOpen;
  const [submitting, setSubmitting] = useState(false);
  const [runtimeId, setRuntimeId] = useState("");
  const [path, setPath] = useState("");
  const [kind, setKind] = useState<"github" | "folder" | "repository">("github");
  const [githubMode, setGithubMode] = useState<"existing" | "new">("existing");
  const [githubRepository, setGithubRepository] = useState("");
  const [newName, setNewName] = useState("");
  const [privateRepository, setPrivateRepository] = useState(true);
  const [repository, setRepository] = useState("");
  const { addFolder, addRepository, addGithubRepository, addNewGithubRepository } = useProjects();
  const github = useGithubRepositories(open && kind === "github", githubMode === "new");
  const { runtimes, defaultRunner, refresh: refreshRuntimes } = useRuntimes();

  const hosts = runtimes.filter((runtime) => runtime.directories.length > 0);
  const chosenRunner = runtimeId || (hosts.find((runtime) => runtime.online) ?? hosts[0])?.id || "";
  const repositoryName = newName.trim();
  const nameReady =
    repositoryName.length <= MAX_REPOSITORY_NAME &&
    REPOSITORY_NAME.test(repositoryName) &&
    /[A-Za-z0-9]/.test(repositoryName);
  const canSubmit =
    kind === "github"
      ? Boolean(github.installation) &&
        (githubMode === "existing" ? Boolean(githubRepository) : nameReady)
      : Boolean(
          chosenRunner && (kind === "folder" ? path.startsWith("/") : repository.trim().length > 0),
        );

  function handleOpenChange(next: boolean) {
    setInnerOpen(next);
    control?.onOpenChange(next);

    if (next) void refreshRuntimes();

    if (!next) {
      setRuntimeId("");
      setPath("");
      setRepository("");
      setGithubRepository("");
      setGithubMode("existing");
      setNewName("");
      setPrivateRepository(true);
      setKind("github");
    }
  }

  function chooseRunner(next: string) {
    setRuntimeId(next);
    setPath("");
  }

  function add() {
    if (kind === "github" && githubMode === "new")
      return addNewGithubRepository({
        installationId: github.installation,
        name: repositoryName,
        private: privateRepository,
      });

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
    githubMode,
    setGithubMode,
    githubRepository,
    setGithubRepository,
    newName,
    setNewName,
    privateRepository,
    setPrivateRepository,
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
