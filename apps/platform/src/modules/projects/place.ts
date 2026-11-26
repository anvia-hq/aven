import type { Project } from "./types";

export const projectPlace = (project: Pick<Project, "repoFullName" | "directory">) =>
  project.repoFullName ?? project.directory ?? "";

export const projectPlaceShort = (project: Pick<Project, "repoFullName" | "directory">) =>
  project.repoFullName ?? project.directory?.split("/").filter(Boolean).at(-1) ?? "";
