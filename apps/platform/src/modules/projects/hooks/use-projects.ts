import { useAtom } from "jotai";

import { toast } from "@/components/toast";

import { projectsAtom } from "../atoms/projects-atom";

export function useProjects() {
  const [projects, setProjects] = useAtom(projectsAtom);

  function create(input: { name: string; repo: string }) {
    const now = new Date().toISOString();
    setProjects((all) => [
      {
        id: `p-${Math.random().toString(36).slice(2, 8)}`,
        name: input.name,
        repo: input.repo,
        description: "No description yet.",
        language: "TypeScript",
        defaultBranch: "main",
        status: "active",
        createdAt: now,
        updatedAt: now,
        commits: [],
        files: [],
      },
      ...all,
    ]);
    toast.add({ title: "Project created", description: input.name, type: "success" });
  }

  function setArchived(projectId: string, archived: boolean) {
    setProjects((all) =>
      all.map((project) =>
        project.id === projectId
          ? { ...project, status: archived ? "archived" : "active" }
          : project,
      ),
    );
    toast.add({ title: archived ? "Project archived" : "Project restored", type: "success" });
  }

  return { projects, create, setArchived };
}
