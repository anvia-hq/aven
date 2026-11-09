import type { ComposerTriggerDefinition, ComposerTriggerItem } from "@anvia/react-ui/chat";
import { mentionToken } from "@aven/protocol/events";
import { useEffect, useMemo, useRef } from "react";

import { api } from "@/lib/api";
import type { FolderResponse, SearchResponse } from "@/modules/files/types";
import { useSkills } from "@/modules/skills/hooks/use-skills";

import { COMPACT_COMMAND, PERSON_PREFIX, personToken } from "../mentions";
import type { Mentionable, MentionPerson } from "../types";

const REPO_SKILLS = ".aven/skills";
const SEARCH_DELAY_MS = 120;
const MAX_SKILLS = 50;
const SKILLS_WAIT_MS = 3000;

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

const compactItem: ComposerTriggerItem = {
  id: COMPACT_COMMAND,
  label: "compact",
  text: COMPACT_COMMAND,
  detail: "Summarize the conversation so far to free up context",
};

const personItem = (person: MentionPerson): ComposerTriggerItem => ({
  id: `${PERSON_PREFIX}${person.id}`,
  label: person.name,
  text: personToken(person),
  detail: person.email,
});

export function useMentions(threadId: string | undefined, people: MentionPerson[] = []) {
  const mentionable = useRef(people);
  mentionable.current = people;
  const { personal, builtIn, loaded } = useSkills();
  const skillsLoaded = useRef(Promise.withResolvers<void>());
  useEffect(() => {
    if (loaded) skillsLoaded.current.resolve();
  }, [loaded]);
  const skills = useRef<SkillOption[]>([]);
  skills.current = [
    ...personal
      .filter((skill) => skill.enabled)
      .map(({ name, description }) => ({ name, detail: description })),
    ...builtIn.map(({ name, description }) => ({ name, detail: description })),
  ];
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
      items: async ({ query, signal }) => {
        await Promise.race([
          skillsLoaded.current.promise,
          new Promise((resolve) => {
            const timer = setTimeout(resolve, SKILLS_WAIT_MS);
            signal.addEventListener("abort", () => clearTimeout(timer), { once: true });
          }),
        ]);
        if (threadId && (query === "" || !repoSkills.current)) {
          repoSkills.current = listRepoSkills(threadId);
        }
        const fromRepo = (await repoSkills.current) ?? [];
        const byName = new Map<string, SkillOption>();
        for (const skill of [...fromRepo, ...skills.current]) {
          if (!byName.has(skill.name)) byName.set(skill.name, skill);
        }
        const wanted = query.toLowerCase();
        const skillItems = [...byName.values()]
          .filter(({ name }) => name.includes(wanted))
          .slice(0, MAX_SKILLS)
          .map(({ name, detail }) => itemOf({ type: "skill", name }, detail));
        return threadId && "compact".includes(wanted) ? [compactItem, ...skillItems] : skillItems;
      },
    };
    if (!threadId) return [skillTrigger];

    const fileTrigger: ComposerTriggerDefinition = {
      id: "file",
      char: "@",
      items: async ({ query, signal }) => {
        const wanted = query.toLowerCase();
        const teammates = mentionable.current
          .filter(({ name, email }) => `${name} ${email}`.toLowerCase().includes(wanted))
          .map(personItem);
        if (!(await wait(SEARCH_DELAY_MS, signal))) return teammates;
        const found = await api<SearchResponse>(
          `/threads/${threadId}/files/search?q=${encodeURIComponent(query)}`,
          { signal },
        ).catch(() => undefined);
        if (!found?.available) return teammates;
        return [...teammates, ...found.paths.map((path) => itemOf({ type: "file", name: path }))];
      },
    };
    return [fileTrigger, skillTrigger];
  }, [threadId]);
}
