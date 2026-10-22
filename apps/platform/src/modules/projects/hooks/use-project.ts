import { useProjects } from "./use-projects";

export function useProject(projectId: string) {
  return useProjects().projects.find((project) => project.id === projectId);
}
