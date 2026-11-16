import type { Project } from "./types";

export function projectFits(
  project: Pick<Project, "repoFullName" | "directory" | "runtimeId">,
  runtime: { id: string; isCloud: boolean } | undefined,
) {
  if (!runtime) return false;

  if (runtime.isCloud) return project.repoFullName !== null && project.directory === null;

  return project.directory !== null && project.runtimeId === runtime.id;
}
