import type { Project } from "./types";

export const projectPlace = (project: Pick<Project, "repoFullName" | "directory">) =>
  project.repoFullName ?? project.directory ?? "";
