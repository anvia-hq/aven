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
  SidebarTrigger,
} from "@/components/sidebar";
import { TooltipProvider } from "@/components/tooltip";
import { UserCard } from "@/modules/auth/components/user-card";
import { useSignOut } from "@/modules/auth/hooks/use-sign-out";
import { BotRailLink } from "@/modules/bots/components/bot-rail-link";
import { CenterRailLink } from "@/modules/center/components/center-rail-link";
import { CockpitRailLink } from "@/modules/cockpit/components/cockpit-rail-link";
import { MachineMonitor } from "@/modules/runtimes/components/machine-monitor";
import { ThemeSelector } from "@/modules/theme/components/theme-selector";

import { useCommandMenu } from "../hooks/use-command-menu";
import { useSidebarWidth } from "../hooks/use-sidebar-width";
import { CommandMenu } from "./command-menu";
import { MobileAppLinks } from "./mobile-app-links";
import { SidebarResizer } from "./sidebar-resizer";

type Props = {
  user: { name: string };
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
        </nav>
      </TooltipProvider>
      <div
        className={cn(
          "flex min-w-0 flex-1 md:my-2 md:mr-2",
          !drawsOwnCards &&
            "md:h-[calc(100svh-1rem)] md:overflow-clip md:rounded-xl md:border-y md:border-r md:border-sidebar-border md:bg-background",
        )}
      >
        <Sidebar
          collapsible="icon"
          className={cn(
            "text-sidebar-foreground/80 data-[side=left]:left-14 md:inset-y-2 md:h-[calc(100svh-1rem)] md:*:rounded-l-xl md:rounded-l-xl md:border-y md:border-l md:border-sidebar-border",
            drawsOwnCards && "md:bg-background",
          )}
        >
          <SidebarHeader>
            <div className="flex items-center justify-between gap-2 group-data-[collapsible=icon]:flex-col">
              <div className="min-w-0 flex-1">
                <UserCard name={user.name} onSignOut={signOut} />
              </div>
              <div className="mr-1 flex shrink-0 items-center group-data-[collapsible=icon]:mr-0 group-data-[collapsible=icon]:flex-col">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Search"
                  onClick={() => setCommandOpen(true)}
                >
                  <Search />
                </Button>
              </div>
            </div>
            <MobileAppLinks />
          </SidebarHeader>
          <SidebarContent>{sidebar}</SidebarContent>
          <SidebarFooter>
            <MachineMonitor />
            <div className="flex items-center gap-1 group-data-[collapsible=icon]:flex-col">
              <Button
                variant="ghost"
                size="sm"
                aria-label="Settings"
                className="min-w-0 flex-1 justify-start group-data-[collapsible=icon]:size-7 group-data-[collapsible=icon]:flex-none group-data-[collapsible=icon]:p-0"
                onClick={() => navigate({ to: "/settings/profile" })}
              >
                <Cog />
                <span className="group-data-[collapsible=icon]:hidden">Settings</span>
              </Button>
              <ThemeSelector />
            </div>
          </SidebarFooter>
          <SidebarResizer size={sidebarSize} />
        </Sidebar>
        <SidebarInset
          className={cn(drawsOwnCards ? "md:bg-transparent" : "md:min-h-0 md:overflow-y-auto")}
        >
          <div className="flex h-10 shrink-0 items-center gap-1 border-b px-2 md:hidden">
            <SidebarTrigger />
            <span className="text-sm font-medium">Aven</span>
          </div>
          <Outlet />
        </SidebarInset>
      </div>
      <CommandMenu />
    </SidebarProvider>
  );
}
