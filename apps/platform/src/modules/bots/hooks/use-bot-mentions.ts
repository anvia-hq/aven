import type { ComposerTriggerDefinition, ComposerTriggerItem } from "@anvia/react-ui/chat";
import { mentionToken } from "@aven/protocol/events";
import { useMemo, useRef } from "react";

import { useSkills } from "@/modules/skills/hooks/use-skills";
import { useProjects } from "@/modules/projects/hooks/use-projects";
import { useThreads } from "@/modules/threads/hooks/use-threads";

import { threadMentionText } from "../mentions";
import type { Bot } from "../types";
import { useBots } from "./use-bots";

const itemOf = (bot: Bot): ComposerTriggerItem => ({
  id: bot.id,
  label: bot.name,
  text: `@${bot.name}`,
  detail: bot.description || undefined,
  data: { kind: "bot", avatar: bot.avatar },
});

const THREAD_CHOICES = 8;
const MAX_SKILLS = 50;

const threadItem = (
  thread: { id: string; title: string; projectId: string },
  projectName: string | undefined,
): ComposerTriggerItem => ({
  id: thread.id,
  label: thread.title,
  text: threadMentionText(thread.id, thread.title),
  detail: projectName ?? "Thread",
  data: { kind: "thread", projectId: thread.projectId },
});

export function useBotMentions(selfId: string, main: boolean) {
  const { bots } = useBots();
  const { threads } = useThreads();
  const { personal, builtIn } = useSkills();
  const skills = useRef<{ name: string; detail: string }[]>([]);
  skills.current = [...personal.filter((skill) => skill.enabled), ...builtIn].map(
    ({ name, description }) => ({ name, detail: description }),
  );
  const { projects } = useProjects();
  const names = useRef(new Map<string, string>());
  names.current = new Map(projects.map((project) => [project.id, project.name]));
  const others = useRef<Bot[]>([]);
  others.current = bots.filter((bot) => bot.id !== selfId);
  const mine = useRef(threads);
  mine.current = threads;

  return useMemo((): ComposerTriggerDefinition[] => {
    return [
      {
        id: "bot",
        char: "@",
        allowSpaces: true,
        items: ({ query }) => {
          const wanted = query.trim().toLowerCase();
          const botItems = main
            ? others.current.filter((bot) => bot.name.toLowerCase().includes(wanted)).map(itemOf)
            : [];
          const threadItems = mine.current
            .filter(
              (thread) => thread.state === "open" && thread.title.toLowerCase().includes(wanted),
            )
            .slice(0, THREAD_CHOICES)
            .map((thread) => threadItem(thread, names.current.get(thread.projectId)));
          return [...botItems, ...threadItems];
        },
      },
      {
        id: "skill",
        char: "/",
        items: ({ query }) => {
          const wanted = query.toLowerCase();
          const seen = new Set<string>();
          return skills.current
            .filter(({ name }) => name.includes(wanted) && !seen.has(name) && seen.add(name))
            .slice(0, MAX_SKILLS)
            .map(({ name, detail }) => ({
              id: name,
              label: name,
              text: mentionToken({ type: "skill", name }),
              detail,
            }));
        },
      },
    ];
  }, [main]);
}
