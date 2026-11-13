import type { Thread } from "@/modules/threads/types";

import type { Project, ProjectActivity, ThreadShelf } from "./types";

export function projectActivity(
  projects: Project[],
  threads: Thread[],
  shelf: ThreadShelf = "open",
): ProjectActivity[] {
  return projects
    .map((project) => {
      const own = threads
        .filter(
          (thread) =>
            thread.projectId === project.id &&
            (thread.state === "archived") === (shelf === "archived"),
        )
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      const newest = own[0]?.updatedAt;
      return {
        project,
        threads: own,
        working: own.filter((thread) => thread.running).length,
        lastActive: newest && newest > project.updatedAt ? newest : project.updatedAt,
      };
    })
    .sort(
      (a, b) =>
        Number(b.working > 0) - Number(a.working > 0) || b.lastActive.localeCompare(a.lastActive),
    );
}
