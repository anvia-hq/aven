import { useState, type FormEvent } from "react";

import { useRuntimes } from "@/modules/runtimes/hooks/use-runtimes";

import type { Project } from "../types";
import { useProjects } from "./use-projects";

export function useAddFolder(onAdded?: (project: Project) => void) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [runtimeId, setRuntimeId] = useState("");
  const [path, setPath] = useState("");
  const { addFolder } = useProjects();
  const { runtimes, defaultRunner, refresh: refreshRuntimes } = useRuntimes();

  const hosts = runtimes.filter((runtime) => runtime.directories.length > 0);
  const chosenRunner = runtimeId || (hosts.find((runtime) => runtime.online) ?? hosts[0])?.id || "";
  const served = hosts.find((runtime) => runtime.id === chosenRunner)?.directories ?? [];
  const canSubmit = Boolean(chosenRunner && path.startsWith("/"));

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) void refreshRuntimes();
    if (!next) {
      setRuntimeId("");
      setPath("");
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
    const project = await addFolder({ runtimeId: chosenRunner, path: path.trim() });
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
    served,
    path,
    setPath,
  };
}
