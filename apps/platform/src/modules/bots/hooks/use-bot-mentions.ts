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

// The composer's `@` (decision 0063): the person's other bots, by name. The menu is searched with
// what follows the `@`, spaces included, since a name can have them. The trigger stays the same
// object while the composer lives, as a new one would remake its editor, and reads the latest bots
// when it is searched. Only the main bot can write to the others, so only its composer has it.
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
