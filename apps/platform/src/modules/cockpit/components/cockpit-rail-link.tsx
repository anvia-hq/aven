import { LayoutDashboard } from "@mynaui/icons-react";
import { Link, useRouterState } from "@tanstack/react-router";

import { cn } from "cn";

// The entry to the cockpit in the rail, under the bot's, with a bar on the rail's edge while the
// page is the cockpit's (decision 0104).
export function CockpitRailLink() {
  const active = useRouterState({
    select: (state) => state.location.pathname.startsWith("/cockpit"),
  });
  return (
    <Link
      to="/cockpit/inbox"
      aria-label="Cockpit"
      title="Cockpit"
      className={cn(
        "relative flex size-7 items-center justify-center rounded-lg text-sidebar-foreground/70 outline-none hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring",
        active && "bg-sidebar-accent text-sidebar-foreground",
      )}
    >
      <LayoutDashboard className="size-4.5" />
      <span
        aria-hidden="true"
        className={cn(
          "absolute top-1/2 -left-2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-primary transition-opacity",
          active ? "opacity-100" : "opacity-0",
        )}
      />
    </Link>
  );
}
