import { useBots } from "@/modules/bots/hooks/use-bots";
import { useProjects } from "@/modules/projects/hooks/use-projects";

import type { FolderChoice } from "../components/memory-note-dialog";
import type { MemoryEvent, MemoryNote } from "../types";
import { useMemory } from "./use-memory";

type Placed = Pick<MemoryNote, "scope" | "projectId" | "botId">;

function keyOf({ scope, projectId, botId }: Placed) {
  if (scope === "project") return `project:${projectId}`;
  if (scope === "bot") return `bot:${botId}`;
  return "personal";
}

/** A folder as the page shows it: what it is called, and its notes. */
export type FolderSection = FolderChoice & { description: string; notes: MemoryNote[] };

// The person's folders: their own, each project of the workspace, each bot, and any other folder
// that has notes, such as a project of another workspace.
export function useMemoryFolders() {
  const { notes, loaded } = useMemory({ fresh: true });
  const { projects } = useProjects();
  const { bots } = useBots();

  const sections = new Map<string, FolderSection>();
  sections.set("personal", {
    key: "personal",
    label: "You",
    description: "About you, for every project and every bot.",
    folder: { scope: "personal" },
    notes: [],
  });
  for (const project of projects) {
    sections.set(`project:${project.id}`, {
      key: `project:${project.id}`,
      label: project.name,
      description: `Your work in ${project.repoFullName}, for its threads.`,
      folder: { scope: "project", projectId: project.id },
      notes: [],
    });
  }
  for (const bot of bots) {
    sections.set(`bot:${bot.id}`, {
      key: `bot:${bot.id}`,
      label: bot.name,
      description: `What ${bot.name} keeps for itself.`,
      folder: { scope: "bot", botId: bot.id },
      notes: [],
    });
  }
  for (const note of notes) {
    const key = keyOf(note);
    if (!sections.has(key) && note.scope === "project" && note.projectId) {
      sections.set(key, {
        key,
        label: "A project of another workspace",
        description: "Switch to its workspace to see which.",
        folder: { scope: "project", projectId: note.projectId },
        notes: [],
      });
    }
    sections.get(key)?.notes.push(note);
  }

  const all = [...sections.values()];
  const folderOf = (event: MemoryEvent) =>
    sections.get(keyOf(event))?.label ?? "A folder that is gone";
  return { sections: all, loaded, folderOf };
}
