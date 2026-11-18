import { Grid } from "@mynaui/icons-react";
import { Link, useRouterState, type LinkProps } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { cn } from "cn";

import { AvenMark } from "@/components/brand-icons";
import { BotAvatar } from "@/modules/bots/components/bot-avatar";
import { useBots } from "@/modules/bots/hooks/use-bots";
import { useBotsWorking } from "@/modules/bots/hooks/use-bots-working";

import { isThreadsSection } from "../sections";

function Tab({
  to,
  label,
  active,
  children,
}: {
  to: NonNullable<LinkProps["to"]>;
  label: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group/tab flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 px-1 pb-1.5 text-[0.6875rem] font-medium outline-none",
        "text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground active:text-foreground",
        active && "text-foreground",
      )}
    >
      <span
        className={cn(
          "flex size-8 items-center justify-center rounded-full transition-colors",
          active
            ? "bg-accent"
            : "group-hover/tab:bg-accent/60 group-focus-visible/tab:bg-accent/60",
        )}
      >
        {children}
      </span>
      <span className={cn("max-w-full truncate", active && "font-semibold")}>{label}</span>
    </Link>
  );
}

export function MobileTabBar() {
  const { main } = useBots();
  const working = useBotsWorking();
  const pathname = useRouterState({
    select: (state) => (state.resolvedLocation ?? state.location).pathname,
  });

  return (
    <nav
      aria-label="Apps"
      className="fixed inset-x-0 bottom-0 z-30 flex h-(--mobile-tab-bar) items-stretch border-t border-border/70 bg-background/95 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm md:hidden"
    >
      <Tab to="/threads" label="Threads" active={isThreadsSection(pathname)}>
        <AvenMark className="w-5 text-brand" />
      </Tab>
      <Tab to="/cockpit/inbox" label="Cockpit" active={pathname.startsWith("/cockpit")}>
        <Grid className="size-5" strokeWidth={1.7} />
      </Tab>
      <Tab to="/bot" label="Bot" active={pathname.startsWith("/bot")}>
        {main ? (
          <BotAvatar
            bot={main}
            mood={working.has(main.id) ? "working" : "idle"}
            className="size-5"
          />
        ) : (
          <span className="size-5 rounded-md bg-sidebar-accent" />
        )}
      </Tab>
    </nav>
  );
}
