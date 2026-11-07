import { useNavigate } from "@tanstack/react-router";

import { toast } from "@/components/toast";
import { api, attempt } from "@/lib/api";
import { useThreads } from "@/modules/threads/hooks/use-threads";

import type { Project } from "../types";
import { useProjects } from "./use-projects";

export function useDeleteProject() {
  const { refresh: refreshProjects } = useProjects();
  const { refresh: refreshThreads } = useThreads();
  const navigate = useNavigate();

  return async function deleteProject(project: Project) {
    const deleted = await attempt("Could not delete the project", () =>
      api<{ deleted: true }>(`/projects/${project.id}`, { method: "DELETE" }),
    );
    if (!deleted) return;
    toast.add({ title: "Project deleted", description: project.name, type: "success" });
    void navigate({ to: "/projects" });
    await Promise.all([refreshProjects(), refreshThreads()]);
  };
}
