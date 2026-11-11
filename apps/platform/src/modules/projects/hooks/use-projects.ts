import { useAtom } from "jotai";
import { useEffect } from "react";

import { toast } from "@/components/toast";
import { attempt, postJson } from "@/lib/api";
import { createListStore } from "@/lib/list-store";

import { projectsAtom } from "../atoms/projects-atom";
import type { Project } from "../types";

const projectsStore = createListStore<Project>({
  path: "/projects",
  atom: projectsAtom,
  label: "projects",
});

export const resetProjects = projectsStore.reset;

export function useProjects() {
  const [projects, setProjects] = useAtom(projectsAtom);

  useEffect(() => {
    if (projects === null) void projectsStore.refresh();
  }, [projects]);

  async function addFolder(input: { runtimeId: string; path: string; name?: string }) {
    const project = await attempt("Could not add the folder", () =>
      postJson<Project>("/projects/folder", input),
    );
    if (!project) return null;
    setProjects((current) => (current ? [project, ...current] : [project]));
    toast.add({ title: "Folder added", description: project.name, type: "success" });
    return project;
  }

  async function moveProject(project: Project, runtimeId: string) {
    const moved = await attempt("Could not change the runner", () =>
      postJson<Project>(`/projects/${project.id}`, { runtimeId }, "PATCH"),
    );
    if (!moved) return null;
    setProjects(
      (current) => current?.map((entry) => (entry.id === moved.id ? moved : entry)) ?? null,
    );
    toast.add({
      title: "Runner changed",
      description: `New threads in ${project.name} run on the new runner.`,
      type: "success",
    });
    return moved;
  }

  return {
    projects: projects ?? [],
    loaded: projects !== null,
    refresh: projectsStore.refresh,
    addFolder,
    moveProject,
  };
}
