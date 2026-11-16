import { isSandbox } from "@/modules/runtimes/sandbox";

import type { Project } from "./types";

export function projectFits(
  project: Pick<Project, "repoFullName" | "directory" | "runtimeId">,
  runtime: { id: string; isCloud: boolean; parentRuntimeId: string | null } | undefined,
) {
  if (!runtime) return false;

  if (isSandbox(runtime)) return project.repoFullName !== null && project.directory === null;

  return project.directory !== null && project.runtimeId === runtime.id;
}
