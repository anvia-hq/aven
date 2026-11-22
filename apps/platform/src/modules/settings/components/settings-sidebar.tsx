import {
  IconBell,
  IconBook,
  IconCode,
  IconCodeblock,
  IconCpu,
  IconExternalLink,
  IconFlag,
  IconId,
  IconKey,
  IconLock,
  IconServer,
  IconSettings,
  IconUserCircle,
  IconUsers,
  IconUsersGroup,
  IconWebhook,
} from "@tabler/icons-react";
import { GithubMark } from "@/components/brand-icons";
import { Link, useRouterState } from "@tanstack/react-router";

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@aven/ui/sidebar";
import { BotLine } from "@/components/bot-line";
import { CloudLine } from "@/components/cloud-line";
import { McpLine } from "@/components/mcp-line";
import { usePlatformConfig } from "@/modules/platform/hooks/use-platform-config";

const groups = [
  {
    label: "Personal",
    items: [
      { to: "/settings/general", label: "General", icon: IconSettings },
      { to: "/settings/profile", label: "Profile", icon: IconUserCircle },
      { to: "/settings/environment-variables", label: "Personal variables", icon: IconLock },
    ],
  },
  {
    label: "AI",
    items: [
      { to: "/settings/providers", label: "Providers", icon: IconCpu },
      { to: "/settings/bots", label: "Bots", icon: BotLine },
      { to: "/settings/memory", label: "Memory", icon: IconId },
    ],
  },
  {
    label: "Agents and integrations",
    items: [
      { to: "/settings/skills", label: "Skills", icon: IconBook },
      { to: "/settings/mcp", label: "MCP Integrations", icon: McpLine },
      { to: "/settings/mcp-access", label: "MCP access", icon: IconCode },
      { to: "/settings/webhooks", label: "Webhooks", icon: IconWebhook },
    ],
  },
  {
    label: "Workspace",
    items: [
      { to: "/settings/members", label: "Members", icon: IconUsers },
      { to: "/settings/github", label: "GitHub", icon: GithubMark },
      { to: "/settings/runtimes", label: "Runtimes", icon: IconCodeblock },
      { to: "/settings/workspace-variables", label: "Workspace variables", icon: IconKey },
      { to: "/settings/decision-model", label: "Decision model", icon: IconFlag },
    ],
  },
] as const;

const platformGroup = {
  label: "Platform",
  items: [
    { to: "/settings/platform", label: "Installation", icon: IconServer },
    { to: "/settings/sandbox", label: "Sandbox", icon: CloudLine },
    { to: "/settings/people", label: "People", icon: IconUsersGroup },
    { to: "/settings/announcements", label: "Announcements", icon: IconBell },
  ],
} as const;

export function SettingsSidebar() {
  const { config } = usePlatformConfig();
  const visibleGroups =
    config?.isOwner && config.platformSettings !== false ? [...groups, platformGroup] : groups;
  const externalAdminUrl =
    config?.isOwner && config.platformSettings === false ? (config.manageUrl ?? null) : null;
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
      {externalAdminUrl && (
        <SidebarGroup className="py-1">
          <SidebarGroupLabel>Platform</SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                render={<a href={externalAdminUrl} target="_blank" rel="noreferrer noopener" />}
                tooltip="Operator Console"
              >
                <IconExternalLink />
                <span>Operator Console</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      )}
    </nav>
  );
}
