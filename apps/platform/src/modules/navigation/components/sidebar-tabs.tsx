import { Chat, Folder } from "@mynaui/icons-react";
import { Link, useRouterState } from "@tanstack/react-router";

import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/sidebar";

const tabs = [
  { to: "/threads", label: "Threads", icon: Chat },
  { to: "/projects", label: "Projects", icon: Folder },
] as const;

export function SidebarTabs() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <SidebarMenu className="px-2">
      {tabs.map((tab) => {
        const active = pathname === tab.to || pathname.startsWith(`${tab.to}/`);
        return (
          <SidebarMenuItem key={tab.to}>
            <SidebarMenuButton render={<Link to={tab.to} />} isActive={active} tooltip={tab.label}>
              <tab.icon />
              <span>{tab.label}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}
