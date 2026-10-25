import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
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
  SidebarRail,
  SidebarTrigger,
} from "@/components/sidebar";
import { authClient } from "@/lib/auth-client";
import { UserCard } from "@/modules/auth/components/user-card";
import { CommandMenu } from "@/modules/navigation/components/command-menu";
import { SidebarTabs } from "@/modules/navigation/components/sidebar-tabs";
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

  async function signOut() {
    await authClient.signOut();
    await navigate({ to: "/login" });
  }

  return (
    <SidebarProvider style={{ "--sidebar-width": "20rem" } as CSSProperties}>
      <Sidebar collapsible="icon" className="text-sidebar-foreground/80">
        <SidebarHeader>
          <div className="flex items-center justify-between gap-2 group-data-[collapsible=icon]:flex-col">
            <div className="min-w-0 flex-1">
              <UserCard name={user.name} onSignOut={signOut} />
            </div>
            <div className="flex shrink-0 items-center group-data-[collapsible=icon]:flex-col">
              <SidebarTrigger />
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
        <SidebarRail />
      </Sidebar>
      <SidebarInset>
        <Outlet />
      </SidebarInset>
      <CommandMenu />
    </SidebarProvider>
  );
}
