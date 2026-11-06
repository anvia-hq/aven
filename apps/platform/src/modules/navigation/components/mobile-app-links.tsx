import { GitBranch, Grid } from "@mynaui/icons-react";
import { Link, useRouterState, type LinkProps } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { cn } from "cn";

import { AvenMark } from "@/components/brand-icons";
import { useSidebar } from "@/components/sidebar";
import { BotAvatar } from "@/modules/bots/components/bot-avatar";
import { useBots } from "@/modules/bots/hooks/use-bots";

function AppLink({
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
  const { setOpenMobile } = useSidebar();
  return (
    <Link
      to={to}
      aria-current={active ? "page" : undefined}
      onClick={() => setOpenMobile(false)}
      className={cn(
        "flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg text-xs text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
        active && "bg-accent text-foreground",
      )}
    >
      {children}
      <span className="max-w-full truncate">{label}</span>
    </Link>
  );
}

// The rail's places (threads, the bot, the cockpit, Center) for a phone, where the rail is not drawn: at the
// head of the sidebar, which opens from the top bar. Choosing one closes it.
export function MobileAppLinks() {
  const { main } = useBots();
  const pathname = useRouterState({
    select: (state) => (state.resolvedLocation ?? state.location).pathname,
  });
  return (
    <nav aria-label="Apps" className="flex gap-1 md:hidden">
      <AppLink
        to="/threads"
        label="Threads"
        active={pathname.startsWith("/threads") || pathname.startsWith("/projects")}
      >
        <AvenMark className="w-5 text-primary" />
      </AppLink>
      <AppLink to="/bot" label="Bot" active={pathname.startsWith("/bot")}>
        {main ? (
          <BotAvatar bot={main} className="size-5" />
        ) : (
          <span className="size-5 rounded-md bg-sidebar-accent" />
        )}
      </AppLink>
      <AppLink to="/cockpit/inbox" label="Cockpit" active={pathname.startsWith("/cockpit")}>
        <Grid className="size-5" strokeWidth={1.7} />
      </AppLink>
      <AppLink to="/center" label="Center" active={pathname.startsWith("/center")}>
        <GitBranch className="size-5" strokeWidth={1.7} />
      </AppLink>
    </nav>
  );
}
