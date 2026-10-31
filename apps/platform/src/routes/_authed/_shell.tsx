import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { Cog, Search } from "@mynaui/icons-react";
import type { CSSProperties } from "react";

import { cn } from "cn";

import { AvenMark } from "@/components/brand-icons";
import { BotRailLink } from "@/modules/bots/components/bot-rail-link";
import { Button } from "@/components/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/sidebar";
import { useSignOut } from "@/modules/auth/hooks/use-sign-out";
import { UserCard } from "@/modules/auth/components/user-card";
import { CommandMenu } from "@/modules/navigation/components/command-menu";
import { SidebarResizer } from "@/modules/navigation/components/sidebar-resizer";
import { SidebarTabs } from "@/modules/navigation/components/sidebar-tabs";
import { useSidebarWidth } from "@/modules/navigation/hooks/use-sidebar-width";
import { useCommandMenu } from "@/modules/navigation/hooks/use-command-menu";
import { ThemeSelector } from "@/modules/theme/components/theme-selector";
import { SidebarThreads } from "@/modules/threads/components/sidebar-threads";

// The sidebar shell around threads and projects; settings is beside it with a frame of its own.
export const Route = createFileRoute("/_authed/_shell")({
  component: ShellLayout,
});

function ShellLayout() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const { setOpen: setCommandOpen } = useCommandMenu();

  const signOut = useSignOut();
  const sidebarSize = useSidebarWidth();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  // A thread draws its own card for the conversation, so its side panels can be cards of their own
  // on the frame beside it, level with it.
  const inThread = /^\/threads\/[^/]+/.test(pathname);

  return (
    <SidebarProvider
      className="bg-frame"
      style={{ "--sidebar-width": `${sidebarSize.width}px` } as CSSProperties}
    >
      {/* The rail takes its own width in the row and stays in view; the sidebar sits beside it. */}
      <aside className="sticky top-0 hidden h-svh w-12 shrink-0 flex-col items-center py-3 md:flex">
        <Link
          to="/threads"
          aria-label="Aven"
          className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground"
        >
          <AvenMark className="w-5" />
        </Link>
        <div className="mt-3">
          <BotRailLink />
        </div>
        <div className="mt-auto mb-1">
          <ThemeSelector />
        </div>
      </aside>
      {/* The sidebar and the page are one white panel in the frame, told apart by the sidebar's own
          border. On a thread the panel is drawn in two parts, the sidebar's and the conversation's,
          which together look the same: both are drawn with real borders, so the content sits in the same
          place on either. */}
      <div
        className={cn(
          "flex min-w-0 flex-1 md:my-2 md:mr-2",
          !inThread &&
            "md:overflow-clip md:rounded-xl md:border-y md:border-r md:border-sidebar-border md:bg-background",
        )}
      >
        <Sidebar
          collapsible="icon"
          className={cn(
            "text-sidebar-foreground/80 data-[side=left]:left-12 md:inset-y-2 md:h-[calc(100svh-1rem)] md:*:rounded-l-xl md:rounded-l-xl md:border-y md:border-l md:border-sidebar-border",
          )}
        >
          <SidebarHeader>
            <div className="flex items-center justify-between gap-2 group-data-[collapsible=icon]:flex-col">
              <div className="min-w-0 flex-1">
                <UserCard name={user.name} onSignOut={signOut} />
              </div>
              <div className="flex shrink-0 items-center group-data-[collapsible=icon]:flex-col">
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
          </SidebarHeader>
          <SidebarContent>
            <SidebarTabs />
            <SidebarThreads />
          </SidebarContent>
          <SidebarFooter>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Settings"
              className="justify-start group-data-[collapsible=icon]:size-7 group-data-[collapsible=icon]:p-0"
              onClick={() => navigate({ to: "/settings/profile" })}
            >
              <Cog />
              <span className="group-data-[collapsible=icon]:hidden">Settings</span>
            </Button>
          </SidebarFooter>
          <SidebarResizer size={sidebarSize} />
        </Sidebar>
        <SidebarInset className={cn(inThread && "md:bg-transparent")}>
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
