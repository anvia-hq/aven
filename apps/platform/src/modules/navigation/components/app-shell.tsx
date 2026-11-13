import { Cog, Search } from "@mynaui/icons-react";
import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import type { CSSProperties, ReactNode } from "react";

import { cn } from "cn";

import { AvenMark } from "@/components/brand-icons";
import { Button } from "@/components/button";
import { RailLink } from "@/components/rail-link";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
} from "@/components/sidebar";
import { TooltipProvider } from "@/components/tooltip";
import { UserCard } from "@/modules/auth/components/user-card";
import { useSignOut } from "@/modules/auth/hooks/use-sign-out";
import { BotRailLink } from "@/modules/bots/components/bot-rail-link";
import { CenterRailLink } from "@/modules/center/components/center-rail-link";
import { CockpitActivityNotifier } from "@/modules/cockpit/components/cockpit-activity-notifier";
import { CockpitRailLink } from "@/modules/cockpit/components/cockpit-rail-link";
import { AnnouncementBanner } from "@/modules/announcements/components/announcement-banner";
import { BetaCard } from "@/modules/notices/components/beta-card";
import { MachineMonitor } from "@/modules/runtimes/components/machine-monitor";

import { useCommandMenu } from "../hooks/use-command-menu";
import { useSidebarWidth } from "../hooks/use-sidebar-width";
import { CommandMenu } from "./command-menu";
import { MobileAppBar, MobileSidebarClose } from "./mobile-app-bar";
import { MobileTabBar } from "./mobile-tab-bar";
import { SidebarResizer } from "./sidebar-resizer";

type Props = {
  user: { name: string; email?: string | null; image?: string | null };
  sidebar: ReactNode;
};

export function AppShell({ user, sidebar }: Props) {
  const navigate = useNavigate();
  const { setOpen: setCommandOpen } = useCommandMenu();

  const signOut = useSignOut();
  const sidebarSize = useSidebarWidth();
  const pathname = useRouterState({
    select: (state) => (state.resolvedLocation ?? state.location).pathname,
  });
  const drawsOwnCards = /^\/(threads\/[^/]+|bot)(\/|$)/.test(pathname);

  return (
    <SidebarProvider
      className="bg-frame"
      style={{ "--sidebar-width": `${sidebarSize.width}px` } as CSSProperties}
    >
      <TooltipProvider delay={300}>
        <nav
          aria-label="Aven"
          className="sticky top-0 hidden h-svh w-14 shrink-0 flex-col items-center py-2.5 md:flex"
        >
          <RailLink
            to="/threads"
            label="Aven"
            tooltip="Aven · threads"
            active={pathname.startsWith("/threads") || pathname.startsWith("/projects")}
          >
            <AvenMark className="w-5 text-brand" />
          </RailLink>
          <span aria-hidden="true" className="my-2.5 h-px w-4.5 bg-input" />
          <div className="flex flex-col items-center gap-1.5">
            <BotRailLink />
            <CockpitRailLink />
            <CenterRailLink />
          </div>
          <div className="mt-auto flex flex-col items-center gap-1.5">
            <RailLink
              to="/settings/general"
              label="Settings"
              active={pathname.startsWith("/settings")}
            >
              <Cog className="size-5" />
            </RailLink>
          </div>
        </nav>
      </TooltipProvider>
      <div className="flex min-w-0 flex-1 md:my-2 md:mr-2">
        <Sidebar
          collapsible="icon"
          className={cn(
            "text-sidebar-foreground/80 data-[side=left]:left-14 md:inset-y-2 md:h-[calc(100svh-1rem)] md:*:rounded-xl md:rounded-xl md:border md:border-sidebar-border",
            drawsOwnCards && "md:bg-background",
          )}
        >
          <SidebarHeader>
            <div className="flex items-center justify-between gap-2 group-data-[collapsible=icon]:flex-col">
              <div className="min-w-0 flex-1">
                <UserCard
                  name={user.name}
                  email={user.email}
                  image={user.image}
                  onSignOut={signOut}
                />
              </div>
              <div className="mr-1 flex shrink-0 items-center group-data-[collapsible=icon]:mr-0 group-data-[collapsible=icon]:flex-col">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Search"
                  className="size-9 md:size-7"
                  onClick={() => setCommandOpen(true)}
                >
                  <Search />
                </Button>
                <MobileSidebarClose />
              </div>
            </div>
          </SidebarHeader>
          <SidebarContent>{sidebar}</SidebarContent>
          <SidebarFooter>
            <BetaCard />
            <AnnouncementBanner />
            <MachineMonitor />
            <div className="flex items-center gap-1 md:hidden">
              <Button
                variant="ghost"
                size="sm"
                aria-label="Settings"
                className="h-9 min-w-0 flex-1 justify-start"
                onClick={() => navigate({ to: "/settings/general" })}
              >
                <Cog />
                <span>Settings</span>
              </Button>
            </div>
          </SidebarFooter>
          <SidebarResizer size={sidebarSize} />
        </Sidebar>
        <SidebarInset
          className={cn(
            "pb-(--mobile-tab-bar) md:ml-1 md:pb-0",
            drawsOwnCards
              ? "md:bg-transparent"
              : "md:h-[calc(100svh-1rem)] md:min-h-0 md:overflow-y-auto md:rounded-xl md:border md:border-sidebar-border",
          )}
        >
          <MobileAppBar />
          <Outlet />
        </SidebarInset>
      </div>
      <MobileTabBar />
      <CockpitActivityNotifier />
      <CommandMenu />
    </SidebarProvider>
  );
}
