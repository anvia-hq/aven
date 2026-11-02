import { ChatDots } from "@mynaui/icons-react";
import { Link, useRouterState } from "@tanstack/react-router";

import { cn } from "cn";

import { useBots } from "../hooks/use-bots";
import { BotAvatar } from "./bot-avatar";

// The entry to the bot in the rail, under the logo: the main bot's own avatar, as large as the
// logo's tile, with a bar on the rail's edge while the page is the bot's. Until the bot has loaded
// it is a chat bubble.
export function BotRailLink() {
  const { main } = useBots();
  const active = useRouterState({ select: (state) => state.location.pathname.startsWith("/bot") });
  return (
    <Link
      to="/bot"
      aria-label="Bot"
      title={main?.name ?? "Bot"}
      className="relative flex size-8 items-center justify-center rounded-lg text-sidebar-foreground/70 transition-opacity outline-none hover:opacity-80 focus-visible:ring-2 focus-visible:ring-sidebar-ring"
    >
      {main ? <BotAvatar bot={main} className="size-8" /> : <ChatDots className="size-5" />}
      <span
        aria-hidden="true"
        className={cn(
          "absolute top-1/2 -left-2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary transition-opacity",
          active ? "opacity-100" : "opacity-0",
        )}
      />
    </Link>
  );
}
