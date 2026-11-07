import type { ComposerTriggerDefinition, ComposerTriggerItem } from "@anvia/react-ui/chat";
import { useMemo, useRef } from "react";

import type { Bot } from "../types";
import { useBots } from "./use-bots";

const itemOf = (bot: Bot): ComposerTriggerItem => ({
  id: bot.id,
  label: bot.name,
  text: `@${bot.name}`,
  detail: bot.description || undefined,
  data: { avatar: bot.avatar },
});

export function useBotMentions(selfId: string, main: boolean) {
  const { bots } = useBots();
  const others = useRef<Bot[]>([]);
  others.current = bots.filter((bot) => bot.id !== selfId);

  return useMemo((): ComposerTriggerDefinition[] => {
    if (!main) return [];
    return [
      {
        id: "bot",
        char: "@",
        allowSpaces: true,
        items: ({ query }) => {
          const wanted = query.trim().toLowerCase();
          return others.current
            .filter((bot) => bot.name.toLowerCase().includes(wanted))
            .map(itemOf);
        },
      },
    ];
  }, [main]);
}
