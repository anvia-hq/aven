import { useAtom } from "jotai";
import { useEffect } from "react";

import { toast } from "@/components/toast";
import { errorMessage, postJson } from "@/lib/api";
import { createListStore } from "@/lib/list-store";

import { projectsAtom } from "../atoms/projects-atom";
import type { Project } from "../types";

const projectsStore = createListStore<Project>({
  path: "/projects",
  atom: projectsAtom,
  label: "projects",
});

// Projects are scoped to the active organization: drop them on a switch or sign-out so the next
// read refetches for whoever is now active.
export const resetProjects = projectsStore.reset;

// All projects, most recently updated first. Loads on first use; call `refresh` after changes.
export function useProjects() {
  const [projects, setProjects] = useAtom(projectsAtom);

  useEffect(() => {
    if (projects === null) void projectsStore.refresh();
  }, [projects]);

  async function importRepository(input: {
    installationId: string;
    repository: string;
    runtimeId: string;
  }) {
    let project: Project;
    try {
      project = await postJson<Project>("/projects", input);
    } catch (failure) {
      toast.add({
        title: "Could not import repository",
        description: errorMessage(failure),
        type: "error",
      });
      return null;
    }
    setProjects((current) => {
      const list = current ?? [];
      return [project, ...list];
    });
    toast.add({ title: "Repository imported", description: project.name, type: "success" });
    return project;
  }

  return {
    projects: projects ?? [],
    loaded: projects !== null,
    refresh: projectsStore.refresh,
    importRepository,
  };
}
