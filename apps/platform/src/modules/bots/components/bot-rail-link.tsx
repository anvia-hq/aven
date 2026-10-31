import { ChatDots } from "@mynaui/icons-react";
import { Link, useRouterState } from "@tanstack/react-router";

import { cn } from "cn";

// The entry to the bot in the rail, under the logo.
export function BotRailLink() {
  const active = useRouterState({ select: (state) => state.location.pathname.startsWith("/bot") });
  return (
    <Link
      to="/bot"
      aria-label="Bot"
      title="Bot"
      className={cn(
        "flex size-8 items-center justify-center rounded-lg text-sidebar-foreground/70 transition-colors hover:bg-accent hover:text-accent-foreground",
        active && "bg-accent text-accent-foreground",
      )}
    >
      <ChatDots className="size-5" />
    </Link>
  );
}
