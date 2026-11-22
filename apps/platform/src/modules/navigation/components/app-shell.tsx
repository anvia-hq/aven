import { IconEdit, IconFolder, IconGitFork, IconSearch, IconSettings } from "@tabler/icons-react";
import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import type { CSSProperties } from "react";

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
import { ShellSidebar } from "./shell-sidebar";
import { SidebarResizer } from "./sidebar-resizer";

type Props = {
  user: { name: string; email?: string | null; image?: string | null };
};

export function AppShell({ user }: Props) {
  const navigate = useNavigate();
  const { setOpen: setCommandOpen } = useCommandMenu();

  const signOut = useSignOut();
  const sidebarSize = useSidebarWidth();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const drawsOwnCards = /^\/(threads\/[^/]+|bot|git)(\/|$)/.test(pathname);

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
          className="sticky top-0 hidden h-svh w-12 shrink-0 flex-col items-center bg-[color-mix(in_oklch,var(--chrome),black_6%)] py-2.5 md:flex"
        >
          <RailLink
            to="/threads"
            label="Aven"
            tooltip="Aven · threads"
            active={pathname.startsWith("/threads")}
          >
            <AvenMark className="w-[17px] text-brand" />
          </RailLink>
          <div className="mt-[0.45rem] flex flex-col items-center gap-[0.45rem]">
            <RailLink to="/projects" label="Projects" active={pathname.startsWith("/projects")}>
              <IconFolder className="size-[17px]" />
            </RailLink>
            <RailLink to="/git" label="Git Center" active={pathname.startsWith("/git")}>
              <IconGitFork className="size-[17px]" />
            </RailLink>
            <CockpitRailLink active={pathname.startsWith("/cockpit")} />
            <BotRailLink active={pathname.startsWith("/bot")} />
          </div>
          <div className="mt-auto flex flex-col items-center gap-[0.45rem]">
            <RailLink
              to="/settings/general"
              label="Settings"
              active={pathname.startsWith("/settings")}
            >
              <IconSettings className="size-[17px]" />
            </RailLink>
          </div>
        </nav>
      </TooltipProvider>
      <div className="flex min-w-0 flex-1">
        <Sidebar
          collapsible="icon"
          className="text-sidebar-foreground/80 data-[side=left]:left-12 group-data-[side=left]:border-r-0"
        >
          <SidebarHeader className="pt-3.5">
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
                  <IconSearch />
                </Button>
                <Button
                  size="icon-sm"
                  aria-label="New thread"
                  className="size-9 rounded-full md:size-7"
                  onClick={() => navigate({ to: "/threads" })}
                >
                  <IconEdit />
                </Button>
                <MobileSidebarClose />
              </div>
            </div>
          </SidebarHeader>
          <SidebarContent>
            <ShellSidebar />
          </SidebarContent>
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
                <IconSettings />
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
              : "md:h-svh md:min-h-0 md:scrollbar-gutter-stable md:overflow-y-auto md:border md:border-foreground/12",
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
