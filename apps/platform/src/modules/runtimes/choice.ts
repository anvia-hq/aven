import type { Project } from "@/modules/projects/types";

import type { Runtime, RuntimeChoice } from "./types";

const ready = (runtime: Runtime) => runtime.isCloud || runtime.online;

export function runtimeChoices(
  project: Pick<Project, "runtimeId" | "directory"> | undefined,
  runtimes: Runtime[],
): RuntimeChoice[] {
  const folderRuntime = project?.directory ? project.runtimeId : null;

  return [...runtimes]
    .sort((a, b) => Number(b.isCloud) - Number(a.isCloud))
    .map((runtime) => {
      if (folderRuntime !== null && runtime.id !== folderRuntime)
        return { runtime, disabled: true, note: "The folder is on another computer" };

      if (folderRuntime !== null) return { runtime, disabled: false, note: null };

      return ready(runtime)
        ? { runtime, disabled: false, note: null }
        : { runtime, disabled: true, note: "offline" };
    });
}

export function defaultRuntimeId(
  project: Pick<Project, "runtimeId" | "directory"> | undefined,
  runtimes: Runtime[],
) {
  if (!project) return undefined;

  const choices = runtimeChoices(project, runtimes);
  const usable = choices.filter((choice) => !choice.disabled);
  const own = usable.find((choice) => choice.runtime.id === project.runtimeId);

  return (own ?? usable[0])?.runtime.id;
}
