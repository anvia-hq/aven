import type { Thread } from "@/modules/threads/types";

import type { Project } from "./types";

const RECENT = 5;

export function recentProjects(projects: Project[], threads: Thread[]) {
  const last = new Map<string, string>();

  for (const thread of threads) {
    const seen = last.get(thread.projectId);

    if (!seen || thread.updatedAt > seen) last.set(thread.projectId, thread.updatedAt);
  }

  return [...projects]
    .sort((a, b) => (last.get(b.id) ?? "").localeCompare(last.get(a.id) ?? ""))
    .filter((project) => last.has(project.id))
    .slice(0, RECENT);
}
