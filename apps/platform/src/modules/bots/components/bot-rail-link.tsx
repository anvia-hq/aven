import { useRouterState } from "@tanstack/react-router";

import { RailLink } from "@/components/rail-link";

import { useBots } from "../hooks/use-bots";
import { useBotsWorking } from "../hooks/use-bots-working";
import { BotAvatar } from "./bot-avatar";

export function BotRailLink() {
  const { main } = useBots();
  const working = useBotsWorking();
  const active = useRouterState({
    select: (state) => (state.resolvedLocation ?? state.location).pathname.startsWith("/bot"),
  });
  return (
    <RailLink to="/bot" label="Bot" tooltip={main?.name ?? "Bot"} active={active}>
      {main ? (
        <BotAvatar bot={main} mood={working.has(main.id) ? "working" : "idle"} className="size-6" />
      ) : (
        <span className="size-6 rounded-lg bg-sidebar-accent" />
      )}
    </RailLink>
  );
}
