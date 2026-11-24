import { IconBolt, IconFolder, IconMessageCircle } from "@tabler/icons-react";
import { Link, useRouterState } from "@tanstack/react-router";

import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@aven/ui/sidebar";

const tabs = [
  { to: "/threads", label: "New thread", icon: IconMessageCircle, exact: true },
  { to: "/projects", label: "Projects", icon: IconFolder, exact: false },
  { to: "/automations", label: "Automations", icon: IconBolt, exact: false },
] as const;

export function SidebarTabs() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <SidebarMenu className="px-2 md:hidden">
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
