import type { ComposerTriggerDefinition, ComposerTriggerItem } from "@anvia/react-ui/chat";
import { useMemo, useRef } from "react";

import { useThreads } from "@/modules/threads/hooks/use-threads";

import { useProjects } from "@/modules/projects/hooks/use-projects";
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
  const others = useRef<Bot[]>([]);
  others.current = bots.filter((bot) => bot.id !== selfId);
  const mine = useRef(threads);
  mine.current = threads;

  return useMemo((): ComposerTriggerDefinition[] => {
    return [
      {
  const { projects } = useProjects();
  const names = useRef(new Map<string, string>());
  names.current = new Map(projects.map((project) => [project.id, project.name]));
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
    ];
  }, [main]);
}
