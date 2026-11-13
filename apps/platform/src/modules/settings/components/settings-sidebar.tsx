import {
  BookOpen,
  ChatDots,
  Code,
  Cog,
  Github,
  Key,
  Api,
  Puzzle,
  Servers,
  SignalWaves,
  Sparkles,
  Terminal,
  Users,
  UsersGroup,
  BookmarkUser,
  Bell,
  UserCircle,
} from "@mynaui/icons-react";
import { Link, useRouterState } from "@tanstack/react-router";

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/sidebar";
import { usePlatformConfig } from "@/modules/platform/hooks/use-platform-config";

const groups = [
  {
    label: "Personal",
    items: [
      { to: "/settings/general", label: "General", icon: Cog },
      { to: "/settings/profile", label: "Profile", icon: UserCircle },
      { to: "/settings/providers", label: "Providers", icon: Sparkles },
      { to: "/settings/claude", label: "Claude Subscription", icon: Code },
      { to: "/settings/bots", label: "Bots", icon: ChatDots },
      { to: "/settings/skills", label: "Skills", icon: BookOpen },
      { to: "/settings/mcp", label: "MCP servers", icon: Puzzle },
      { to: "/settings/mcp-access", label: "MCP access", icon: Api },
      { to: "/settings/webhooks", label: "Webhooks", icon: SignalWaves },
      { to: "/settings/memory", label: "Memory", icon: BookmarkUser },
      { to: "/settings/environment-variables", label: "Environment variables", icon: Key },
    ],
  },
  {
    label: "Workspace",
    items: [
      { to: "/settings/members", label: "Members", icon: Users },
      { to: "/settings/github", label: "GitHub", icon: Github },
      { to: "/settings/runtimes", label: "Runtimes", icon: Terminal },
      { to: "/settings/workspace-variables", label: "Variables", icon: Key },
      { to: "/settings/decision-model", label: "Decision model", icon: Sparkles },
    ],
  },
] as const;

const platformGroup = {
  label: "Platform",
  items: [
    { to: "/settings/platform", label: "Platform", icon: Servers },
    { to: "/settings/people", label: "People", icon: UsersGroup },
    { to: "/settings/announcements", label: "Announcements", icon: Bell },
  ],
} as const;

export function SettingsSidebar() {
  const { config } = usePlatformConfig();
  const visibleGroups = config?.isOwner ? [...groups, platformGroup] : groups;
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <nav aria-label="Settings">
      {visibleGroups.map((group) => (
        <SidebarGroup key={group.label} className="py-1">
          <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
          <SidebarMenu>
            {group.items.map((item) => (
              <SidebarMenuItem key={item.to}>
                <SidebarMenuButton
                  render={
                    <Link to={item.to} aria-current={pathname === item.to ? "page" : undefined} />
                  }
                  isActive={pathname === item.to}
                  tooltip={item.label}
                >
                  <item.icon />
                  <span>{item.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      ))}
    </nav>
  );
}
