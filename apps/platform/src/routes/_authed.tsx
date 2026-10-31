import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { Cog, Search } from "@mynaui/icons-react";
import type { CSSProperties } from "react";

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
import { authClient } from "@/lib/auth-client";
import { useSignOut } from "@/modules/auth/hooks/use-sign-out";
import { UserCard } from "@/modules/auth/components/user-card";
import { CommandMenu } from "@/modules/navigation/components/command-menu";
import { SidebarResizer } from "@/modules/navigation/components/sidebar-resizer";
import { SidebarTabs } from "@/modules/navigation/components/sidebar-tabs";
import { useSidebarWidth } from "@/modules/navigation/hooks/use-sidebar-width";
import { useCommandMenu } from "@/modules/navigation/hooks/use-command-menu";
import { ThemeSelector } from "@/modules/theme/components/theme-selector";
import { SidebarThreads } from "@/modules/threads/components/sidebar-threads";

export const Route = createFileRoute("/_authed")({
  beforeLoad: async () => {
    const { data } = await authClient.getSession();
    if (!data) throw redirect({ to: "/login" });
    return { user: data.user };
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const { setOpen: setCommandOpen } = useCommandMenu();

  const signOut = useSignOut();
  const sidebarSize = useSidebarWidth();
  const inSettings = useRouterState({ select: (state) => state.location.pathname }).startsWith(
    "/settings",
  );

  if (inSettings) {
    return (
      <>
        <Outlet />
        <CommandMenu />
      </>
    );
  }

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
          className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground"
        >
          A
        </Link>
      </aside>
      {/* The sidebar and the page are one white panel in the frame, told apart by the sidebar's own border. */}
      <div className="flex min-w-0 flex-1 md:my-2 md:mr-2 md:overflow-clip md:rounded-xl md:bg-background md:ring-1 md:ring-sidebar-border">
        <Sidebar
          collapsible="icon"
          className="text-sidebar-foreground/80 data-[side=left]:left-12 md:inset-y-2 md:h-[calc(100svh-1rem)] md:overflow-hidden md:rounded-l-xl"
        >
          <SidebarHeader>
            <div className="flex items-center justify-between gap-2 group-data-[collapsible=icon]:flex-col">
              <div className="min-w-0 flex-1">
                <UserCard name={user.name} onSignOut={signOut} />
              </div>
              <div className="flex shrink-0 items-center group-data-[collapsible=icon]:flex-col">
                <ThemeSelector />
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
              size="icon-sm"
              aria-label="Settings"
              onClick={() => navigate({ to: "/settings/profile" })}
            >
              <Cog />
            </Button>
          </SidebarFooter>
          <SidebarResizer size={sidebarSize} />
        </Sidebar>
        <SidebarInset>
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
