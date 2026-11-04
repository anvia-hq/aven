import { useRouterState } from "@tanstack/react-router";

import { RailLink } from "@/components/rail-link";

import { useBots } from "../hooks/use-bots";
import { BotAvatar } from "./bot-avatar";

// Keep the person's own character in the rail, and its space while the bot loads.
export function BotRailLink() {
  const { main } = useBots();
  const active = useRouterState({
    select: (state) => (state.resolvedLocation ?? state.location).pathname.startsWith("/bot"),
  });
  return (
    <RailLink to="/bot" label="Bot" tooltip={main?.name ?? "Bot"} active={active}>
      {main ? (
        <BotAvatar bot={main} className="size-6" />
      ) : (
        <span className="size-6 rounded-lg bg-sidebar-accent" />
      )}
    </RailLink>
  );
}
