import { Cog, Search } from "@mynaui/icons-react";
import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import type { CSSProperties, ReactNode } from "react";

import { cn } from "cn";

import { AvenMark } from "@/components/brand-icons";
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
import { UserCard } from "@/modules/auth/components/user-card";
import { useSignOut } from "@/modules/auth/hooks/use-sign-out";
import { BotRailLink } from "@/modules/bots/components/bot-rail-link";
import { ThemeSelector } from "@/modules/theme/components/theme-selector";

import { useCommandMenu } from "../hooks/use-command-menu";
import { useSidebarWidth } from "../hooks/use-sidebar-width";
import { CommandMenu } from "./command-menu";
import { SidebarResizer } from "./sidebar-resizer";

type Props = {
  user: { name: string };
  /** What the sidebar lists between its header and Settings: threads, bots. */
  sidebar: ReactNode;
};

// The frame of the app: the rail with the logo, and beside it the sidebar and the page. Each part
// of the app brings its own sidebar content, so threads and the bot have shells of their own.
export function AppShell({ user, sidebar }: Props) {
  const navigate = useNavigate();
  const { setOpen: setCommandOpen } = useCommandMenu();

  const signOut = useSignOut();
  const sidebarSize = useSidebarWidth();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  // A thread, and the bot, draw their own card for the conversation, so their side panels can be
  // cards of their own on the frame beside it, level with it.
  const drawsOwnCards = /^\/(threads\/[^/]+|bot)(\/|$)/.test(pathname);

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
          className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground"
        >
          <AvenMark className="w-4" />
        </Link>
        <div className="mt-3">
          <BotRailLink />
        </div>
      </aside>
      {/* The sidebar and the page are one white panel in the frame, told apart by the sidebar's own
          border. On a thread the panel is drawn in two parts, the sidebar's and the conversation's,
          which together look the same: both are drawn with real borders, so the content sits in the same
          place on either. */}
      <div
        className={cn(
          "flex min-w-0 flex-1 md:my-2 md:mr-2",
          !drawsOwnCards &&
            "md:overflow-clip md:rounded-xl md:border-y md:border-r md:border-sidebar-border md:bg-background",
        )}
      >
        <Sidebar
          collapsible="icon"
          className={cn(
            "text-sidebar-foreground/80 data-[side=left]:left-12 md:inset-y-2 md:h-[calc(100svh-1rem)] md:*:rounded-l-xl md:rounded-l-xl md:border-y md:border-l md:border-sidebar-border",
            // Without the panel behind it, the sidebar's border would be drawn over the lighter
            // frame and show more than it does on a panel: give it the panel's surface to sit on,
            // and its top and bottom edges the frame's color, which the panel's two borders make
            // of them there.
            drawsOwnCards && "md:border-y-frame md:bg-background",
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
          <SidebarContent>{sidebar}</SidebarContent>
          <SidebarFooter>
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
        <SidebarInset className={cn(drawsOwnCards && "md:bg-transparent")}>
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
