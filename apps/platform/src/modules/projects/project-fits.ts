import type { Project } from "./types";

export function projectFits(
  project: Pick<Project, "directory" | "runtimeId">,
  runtime: { id: string } | undefined,
) {
  if (!project.directory) return true;

  return project.runtimeId === runtime?.id;
}
