import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { Plus, Search } from "@mynaui/icons-react";
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
import { useCommandMenu } from "@/modules/navigation/hooks/use-command-menu";
import { SidebarTabs } from "@/modules/navigation/components/sidebar-tabs";
import { ThemeSelector } from "@/modules/theme/components/theme-selector";
import { ThreadGroups } from "@/modules/threads/components/thread-groups";

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
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <div className="flex items-center justify-between gap-2 group-data-[collapsible=icon]:flex-col">
            <span className="px-1 text-lg font-semibold group-data-[collapsible=icon]:hidden">
              Aven
            </span>
            <div className="flex items-center gap-0 group-data-[collapsible=icon]:flex-col">
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
              <Button
                variant="outline"
                size="sm"
                aria-label="New"
                className="group-data-[collapsible=icon]:px-0"
                onClick={() => navigate({ to: "/threads" })}
              >
                <span className="group-data-[collapsible=icon]:hidden">New</span>
                <Plus />
              </Button>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <ThreadGroups />
        </SidebarContent>
        <SidebarFooter>
          <SidebarTabs />
          <UserCard name={user.name} onSignOut={signOut} />
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
