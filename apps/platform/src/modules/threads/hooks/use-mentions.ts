import type { ComposerTriggerDefinition, ComposerTriggerItem } from "@anvia/react-ui/chat";
import { mentionToken } from "@aven/protocol/events";
import { useMemo, useRef } from "react";

import { api } from "@/lib/api";
import type { FolderResponse, SearchResponse } from "@/modules/files/types";
import { useSkills } from "@/modules/skills/hooks/use-skills";

import type { Mentionable } from "../mentions";

// Where a repository keeps its own skills (decision 0035).
const REPO_SKILLS = ".aven/skills";
// A search waits this long for the next key before it asks the runner.
const SEARCH_DELAY_MS = 120;
const MAX_SKILLS = 50;

const itemOf = (mention: Mentionable, detail?: string): ComposerTriggerItem => ({
  id: mention.name,
  label: mention.name,
  text: mentionToken(mention),
  detail,
});

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(!signal.aborted), ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve(false);
    });
  });

type SkillOption = { name: string; detail: string };

// The composer's `@` and `/` (decision 0036). `@` finds files of the thread's workspace, so it
// is there only in a thread; `/` offers the skills a run would have: the repository's own (in a
// thread), the user's enabled ones and the built-in ones, the first of these winning on a name.
// The triggers stay the same object while the composer lives: a new one would remake its editor.
export function useMentions(threadId: string | undefined) {
  const { personal, builtIn } = useSkills();
  const skills = useRef<SkillOption[]>([]);
  skills.current = [
    ...personal
      .filter((skill) => skill.enabled)
      .map(({ name, description }) => ({ name, detail: description })),
    ...builtIn.map(({ name, description }) => ({ name, detail: description })),
  ];
  // The repository's skills, read again each time `/` is typed anew.
  const repoSkills = useRef<Promise<SkillOption[]> | undefined>(undefined);

  return useMemo((): ComposerTriggerDefinition[] => {
    const listRepoSkills = async (id: string) => {
      const folder = await api<FolderResponse>(
        `/threads/${id}/files?path=${encodeURIComponent(REPO_SKILLS)}`,
      ).catch(() => undefined);
      if (!folder?.available) return [];
      return folder.entries
        .filter((entry) => entry.type === "directory")
        .map(({ name }) => ({ name, detail: "From the repository" }));
    };

    const skillTrigger: ComposerTriggerDefinition = {
      id: "skill",
      char: "/",
      items: async ({ query }) => {
        if (threadId && (query === "" || !repoSkills.current)) {
          repoSkills.current = listRepoSkills(threadId);
        }
        // The first of a name wins: the repository's, then the user's, then the built-in one.
        const fromRepo = (await repoSkills.current) ?? [];
        const byName = new Map<string, SkillOption>();
        for (const skill of [...fromRepo, ...skills.current]) {
          if (!byName.has(skill.name)) byName.set(skill.name, skill);
        }
        const wanted = query.toLowerCase();
        return [...byName.values()]
          .filter(({ name }) => name.includes(wanted))
          .slice(0, MAX_SKILLS)
          .map(({ name, detail }) => itemOf({ type: "skill", name }, detail));
      },
    };
    if (!threadId) return [skillTrigger];

    const fileTrigger: ComposerTriggerDefinition = {
      id: "file",
      char: "@",
      items: async ({ query, signal }) => {
        if (!(await wait(SEARCH_DELAY_MS, signal))) return [];
        const found = await api<SearchResponse>(
          `/threads/${threadId}/files/search?q=${encodeURIComponent(query)}`,
          { signal },
        ).catch(() => undefined);
        if (!found?.available) return [];
        return found.paths.map((path) => itemOf({ type: "file", name: path }));
      },
    };
    return [fileTrigger, skillTrigger];
  }, [threadId]);
}
