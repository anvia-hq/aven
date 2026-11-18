import { ChatRoundIcon, FolderIcon } from "@solar-icons/react/linear";
import { Link, useRouterState } from "@tanstack/react-router";

import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@aven/ui/sidebar";

const tabs = [
  { to: "/threads", label: "New thread", icon: ChatRoundIcon, exact: true },
  { to: "/projects", label: "Projects", icon: FolderIcon, exact: false },
] as const;

export function SidebarTabs() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <SidebarMenu className="px-2">
      {tabs.map((tab) => {
        const active = pathname === tab.to || (!tab.exact && pathname.startsWith(`${tab.to}/`));
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
