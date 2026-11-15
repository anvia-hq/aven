import { useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";

import { RailLink } from "@/components/rail-link";

import { botRailStore, useBotRail } from "../hooks/use-bot-rail";
import { useBots } from "../hooks/use-bots";
import { useBotsWorking } from "../hooks/use-bots-working";
import { BotAvatar } from "./bot-avatar";

const BOT_PATH = /^\/bot\/([^/]+)$/;

export function BotRailPeers() {
  const { bots, main } = useBots();
  const working = useBotsWorking();
  const shown = useBotRail(main?.id);
  const pathname = useRouterState({
    select: (state) => (state.resolvedLocation ?? state.location).pathname,
  });
  const seen = BOT_PATH.exec(pathname)?.[1];

  useEffect(() => {
    if (seen === undefined || working.has(seen)) return;

    botRailStore.markOpened(seen);
  }, [seen, working]);

  const peers = shown.flatMap((id) => {
    const bot = bots.find((each) => each.id === id);

    return bot ? [bot] : [];
  });

  return (
    <>
      {peers.map((bot) => (
        <RailLink
          key={bot.id}
          to="/bot/$botId"
          params={{ botId: bot.id }}
          label={bot.name}
          active={pathname === `/bot/${bot.id}`}
        >
          <BotAvatar bot={bot} mood={working.has(bot.id) ? "working" : "idle"} className="size-5" />
        </RailLink>
      ))}
    </>
  );
}
