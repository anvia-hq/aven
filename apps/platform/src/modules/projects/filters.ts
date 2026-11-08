import type {
  Project,
  ProjectFilterContext,
  ProjectFilters,
  ProjectsSearch,
  ProjectsView,
} from "./types";

const VIEWS: ProjectsView[] = ["all", "mine", "working"];

export const PROJECT_VIEWS: { id: ProjectsView; label: string }[] = [
  { id: "all", label: "All" },
  { id: "mine", label: "Mine" },
  { id: "working", label: "Working" },
];

const text = (value: unknown) =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;

const typed = (value: unknown) =>
  typeof value === "string" && value.trim() !== "" ? value : undefined;

export function parseProjectsSearch(search: Record<string, unknown>): ProjectsSearch {
  const view = VIEWS.find((candidate) => candidate === search.view);
  return {
    project: text(search.project),
    q: typed(search.q),
    view: view === "all" ? undefined : view,
    runner: text(search.runner),
  };
}

export function filtersOf(search: ProjectsSearch): ProjectFilters {
  return { query: search.q, view: search.view ?? "all", runnerId: search.runner };
}

export function filterProjects(
  projects: Project[],
  filters: ProjectFilters,
  { me, running }: ProjectFilterContext,
): Project[] {
  const query = filters.query?.trim().toLowerCase();
  return projects.filter((project) => {
    if (query && !`${project.name} ${project.repoFullName}`.toLowerCase().includes(query)) {
      return false;
    }
    if (filters.view === "mine" && project.createdBy !== me) return false;
    if (filters.view === "working" && !running.has(project.id)) return false;
    if (filters.runnerId && project.runtimeId !== filters.runnerId) return false;
    return true;
  });
}

export function anyFilterSet(filters: ProjectFilters) {
  return Boolean(filters.query?.trim() || filters.runnerId) || filters.view !== "all";
}
