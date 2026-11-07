import { useState, type FormEvent } from "react";

import { useRuntimes } from "@/modules/runtimes/hooks/use-runtimes";

import type { ImportStage, Project } from "../types";
import { useGithub } from "./use-github";
import { useProjects } from "./use-projects";

type StageInput = {
  failure: string | null;
  configured: boolean | undefined;
  installationCount: number | undefined;
  runnerCount: number | undefined;
};

function stageOf({ failure, configured, installationCount, runnerCount }: StageInput): ImportStage {
  if (failure) return { kind: "failed", message: failure };
  if (configured === false) return { kind: "not-configured" };
  if (installationCount === 0) return { kind: "connect" };
  if (runnerCount === 0) return { kind: "no-runner" };
  return { kind: "ready" };
}

export function useImportRepository(onImported?: (project: Project) => void) {
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
  const chosenRunner = runtimeId || (defaultRunner?.id ?? "");
  const canSubmit = Boolean(installationId && repository && chosenRunner);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) void refreshRuntimes();
    if (!next) {
      setInstallation("");
      setRepository("");
      setRuntimeId("");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
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

  function chooseInstallation(next: string) {
    setInstallation(next);
    setRepository("");
  }

  const runners = runtimes.map((runtime) => ({
    value: runtime.id,
    label: runtime.online ? runtime.name : `${runtime.name} (offline)`,
  }));
  const repoOptions = (repos?.data ?? []).map((repo) => ({
    value: repo.fullName,
    label: repo.private ? `${repo.fullName} (private)` : repo.fullName,
  }));

  return {
    open,
    handleOpenChange,
    handleSubmit,
    submitting,
    canSubmit,
    stage,
    installUrl,
    installations,
    installationId,
    chooseInstallation,
    repos,
    repoOptions,
    repository,
    setRepository,
    runners,
    chosenRunner,
    setRuntimeId,
  };
}
