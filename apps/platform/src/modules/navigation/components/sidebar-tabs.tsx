import { Chat, Folder } from "@mynaui/icons-react";
import { Link, useRouterState } from "@tanstack/react-router";

import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@aven/ui/sidebar";
import { useThreads } from "@/modules/threads/hooks/use-threads";

const tabs = [
  { to: "/threads", label: "New thread", icon: Chat, exact: true },
  { to: "/projects", label: "Projects", icon: Folder, exact: false },
] as const;

export function SidebarTabs() {
  const { pathname, search } = useRouterState({ select: (state) => state.location });
  const { threads } = useThreads();
  const open = pathname.match(/^\/threads\/([^/]+)$/)?.[1];
  const fromThread = threads.find((thread) => thread.id === open)?.projectId;
  const asked = new URLSearchParams(search).get("project") ?? undefined;
  const project = fromThread ?? asked;

  return (
    <SidebarMenu className="px-2">
      {tabs.map((tab) => {
        const active = pathname === tab.to || (!tab.exact && pathname.startsWith(`${tab.to}/`));
        return (
          <SidebarMenuItem key={tab.to}>
            <SidebarMenuButton
              render={<Link to={tab.to} search={tab.to === "/threads" ? { project } : {}} />}
              isActive={active}
              tooltip={tab.label}
            >
              <tab.icon />
              <span>{tab.label}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}
