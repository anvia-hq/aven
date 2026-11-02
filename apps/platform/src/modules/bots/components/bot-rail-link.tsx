import { ChatDots } from "@mynaui/icons-react";
import { Link, useRouterState } from "@tanstack/react-router";

import { cn } from "cn";

import { useBots } from "../hooks/use-bots";
import { BotAvatar } from "./bot-avatar";

// The entry to the bot in the rail, under the logo: the main bot's own avatar in a tile of the
// logo's size with a rounded border, which the page being the bot's turns to the primary color.
// Until the bot has loaded it is a chat bubble.
export function BotRailLink() {
  const { main } = useBots();
  const active = useRouterState({ select: (state) => state.location.pathname.startsWith("/bot") });
  return (
    <Link
      to="/bot"
      aria-label="Bot"
      title={main?.name ?? "Bot"}
      className={cn(
        "flex size-8 items-center justify-center rounded-lg border border-foreground/40 bg-sidebar-accent text-sidebar-foreground/70 transition-colors outline-none hover:border-foreground/70 focus-visible:ring-2 focus-visible:ring-sidebar-ring",
        active && "border-primary ring-1 ring-primary ring-inset",
      )}
    >
      {main ? <BotAvatar bot={main} className="size-5" /> : <ChatDots className="size-5" />}
    </Link>
  );
}
