import { useState, type FormEvent } from "react";

import { useRuntimes } from "@/modules/runtimes/hooks/use-runtimes";

import type { Project } from "../types";
import { useProjects } from "./use-projects";

export function useAddProject(onAdded?: (project: Project) => void) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [runtimeId, setRuntimeId] = useState("");
  const [path, setPath] = useState("");
  const [kind, setKind] = useState<"folder" | "repository">("folder");
  const [repository, setRepository] = useState("");
  const { addFolder, addRepository } = useProjects();
  const { runtimes, defaultRunner, refresh: refreshRuntimes } = useRuntimes();

  const hosts = runtimes.filter((runtime) => runtime.directories.length > 0);
  const chosenRunner = runtimeId || (hosts.find((runtime) => runtime.online) ?? hosts[0])?.id || "";
  const canSubmit = Boolean(
    chosenRunner && (kind === "folder" ? path.startsWith("/") : repository.trim().length > 0),
  );

  const chosenName = runtimes.find((runtime) => runtime.id === chosenRunner)?.name ?? "";
  let footerNote = "No repository yet";

  if (kind === "folder") footerNote = path ? `${chosenName}: ${path}` : "No folder chosen yet";
  else if (repository.trim()) footerNote = `Clone ${repository.trim()} to ${chosenName}`;

  function handleOpenChange(next: boolean) {
    setOpen(next);

    if (next) void refreshRuntimes();

    if (!next) {
      setRuntimeId("");
      setPath("");
      setRepository("");
      setKind("folder");
    }
  }

  function chooseRunner(next: string) {
    setRuntimeId(next);
    setPath("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSubmit) return;

    setSubmitting(true);
    const project =
      kind === "folder"
        ? await addFolder({ runtimeId: chosenRunner, path: path.trim() })
        : await addRepository({ runtimeId: chosenRunner, repository: repository.trim() });
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
    footerNote,
  };
}
