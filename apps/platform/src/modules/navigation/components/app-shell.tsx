import {
  FolderIcon,
  MagnifierIcon,
  PenNewSquareIcon,
  SettingsIcon,
} from "@solar-icons/react/linear";
import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import type { CSSProperties, ReactNode } from "react";

import { cn } from "cn";

import { AvenMark } from "@/components/brand-icons";
import { Button } from "@aven/ui/button";
import { RailLink } from "@/components/rail-link";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
} from "@aven/ui/sidebar";
import { TooltipProvider } from "@aven/ui/tooltip";
import { UserCard } from "@/modules/auth/components/user-card";
import { useSignOut } from "@/modules/auth/hooks/use-sign-out";
import { BotRailLink } from "@/modules/bots/components/bot-rail-link";
import { CockpitRailLink } from "@/modules/cockpit/components/cockpit-rail-link";
import { AnnouncementBanner } from "@/modules/announcements/components/announcement-banner";
import { MentionsButton } from "@/modules/mentions/components/mentions-button";

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
      className="bg-(--chrome)"
      style={
        {
          "--sidebar-width": `${sidebarSize.width}px`,
          "--sidebar": "var(--chrome)",
          "--sidebar-accent": "color-mix(in oklch, var(--chrome), var(--foreground) 9%)",
        } as CSSProperties
      }
    >
      <TooltipProvider delay={300}>
        <nav
          aria-label="Aven"
          className="sticky top-0 hidden h-svh w-12 shrink-0 flex-col items-center py-2.5 md:flex"
        >
          <RailLink
            to="/threads"
            label="Aven"
            tooltip="Aven · threads"
            active={pathname.startsWith("/threads")}
          >
            <AvenMark className="w-[17px] text-brand" />
          </RailLink>
          <div className="mt-1.5 flex flex-col items-center gap-1.5">
            <RailLink to="/projects" label="Projects" active={pathname.startsWith("/projects")}>
              <FolderIcon className="size-[17px]" />
            </RailLink>
            <CockpitRailLink />
            <BotRailLink />
          </div>
          <div className="mt-auto flex flex-col items-center gap-1.5">
            <RailLink
              to="/settings/general"
              label="Settings"
              active={pathname.startsWith("/settings")}
            >
              <SettingsIcon className="size-[17px]" />
            </RailLink>
          </div>
        </nav>
      </TooltipProvider>
      <div className="flex min-w-0 flex-1">
        <Sidebar collapsible="icon" className="text-sidebar-foreground/80 data-[side=left]:left-12">
          <SidebarHeader>
            <div className="flex items-center justify-between gap-2 group-data-[collapsible=icon]:flex-col">
              <div className="min-w-0 flex-1">
                <UserCard
                  name={user.name}
                  email={user.email}
                  image={user.image}
                  onSignOut={signOut}
                  onOpenCommand={() => setCommandOpen(true)}
                />
              </div>
              <div className="mr-1 flex shrink-0 items-center group-data-[collapsible=icon]:mr-0 group-data-[collapsible=icon]:flex-col">
                <MentionsButton />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Search"
                  className="size-9 md:size-7"
                  onClick={() => setCommandOpen(true)}
                >
                  <MagnifierIcon />
                </Button>
                <Button
                  size="icon-sm"
                  aria-label="New thread"
                  className="size-9 md:size-7"
                  onClick={() => navigate({ to: "/threads" })}
                >
                  <PenNewSquareIcon />
                </Button>
                <MobileSidebarClose />
              </div>
            </div>
          </SidebarHeader>
          <SidebarContent>{sidebar}</SidebarContent>
          <SidebarFooter>
            <AnnouncementBanner />
            <div className="flex items-center gap-1 md:hidden">
              <Button
                variant="ghost"
                size="sm"
                aria-label="Settings"
                className="h-9 min-w-0 flex-1 justify-start"
                onClick={() => navigate({ to: "/settings/general" })}
              >
                <SettingsIcon />
                <span>Settings</span>
              </Button>
            </div>
          </SidebarFooter>
          <SidebarResizer size={sidebarSize} />
        </Sidebar>
        <SidebarInset
          className={cn(
            "pb-(--mobile-tab-bar) md:pb-0",
            drawsOwnCards
              ? "md:bg-transparent"
              : "md:h-svh md:min-h-0 md:scrollbar-gutter-stable md:overflow-y-auto md:border md:border-sidebar-border",
          )}
        >
          <MobileAppBar />
          <Outlet />
        </SidebarInset>
      </div>
      <MobileTabBar />
      <CommandMenu />
    </SidebarProvider>
  );
}
