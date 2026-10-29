import { useAtom } from "jotai";
import { useCallback, useEffect } from "react";

import { toast } from "@/components/toast";
import { ApiError, api, postJson } from "@/lib/api";

import { projectsAtom } from "../atoms/projects-atom";
import type { Project } from "../types";

// One in-flight request shared by every component that asks for the list.
let inflight: Promise<Project[]> | undefined;
// Bumped by `invalidateProjects` (on an organization switch) so a response for the previous
// organization's request, resolving after the switch, can't overwrite the new one's data.
let generation = 0;

// Drops any in-flight request and the atom's cached value, so the next read refetches for
// whichever organization is now active.
export function invalidateProjects() {
  inflight = undefined;
  generation += 1;
}

// All projects, most recently updated first. Loads on first use; call `refresh` after changes.
export function useProjects() {
  const [projects, setProjects] = useAtom(projectsAtom);

  const refresh = useCallback(async () => {
    const thisGeneration = generation;
    inflight ??= api<Project[]>("/projects").finally(() => {
      inflight = undefined;
    });
    try {
      const result = await inflight;
      if (thisGeneration !== generation) return;
      setProjects(result);
    } catch (failure) {
      if (thisGeneration !== generation) return;
      const message = failure instanceof ApiError ? failure.message : "Could not reach the server";
      toast.add({ title: "Could not load projects", description: message, type: "error" });
      setProjects((current) => current ?? []);
    }
  }, [setProjects]);

  useEffect(() => {
    if (projects === null) void refresh();
  }, [projects, refresh]);

  async function create(input: { name: string; projectPath: string; runtimeId?: string }) {
    let project: Project;
    try {
      project = await postJson<Project>("/projects", input);
    } catch (failure) {
      const message = failure instanceof ApiError ? failure.message : "Could not reach the server";
      toast.add({ title: "Could not create project", description: message, type: "error" });
      return null;
    }
    setProjects((current) => {
      const list = current ?? [];
      return [project, ...list];
    });
    toast.add({ title: "Project created", description: project.name, type: "success" });
    return project;
  }

  return { projects: projects ?? [], loaded: projects !== null, refresh, create };
}
