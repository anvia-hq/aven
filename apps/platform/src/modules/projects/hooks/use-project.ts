import { useProjects } from "./use-projects";

export function useProject(projectId: string) {
  const { projects, loaded } = useProjects();
  return { project: projects.find((project) => project.id === projectId), loaded };
}
