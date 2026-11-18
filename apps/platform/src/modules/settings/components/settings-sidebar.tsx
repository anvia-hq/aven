import {
  BookIcon,
  ChatRoundDotsIcon,
  SettingsIcon,
  FlagIcon,
  KeyIcon,
  LockIcon,
  ProgrammingIcon,
  ServerIcon,
  SignalIcon,
  SparklesIcon,
  CodeSquareIcon,
  UsersGroupRoundedIcon,
  UsersGroupTwoRoundedIcon,
  UserIdIcon,
  BellIcon,
  UserCircleIcon,
} from "@solar-icons/react/linear";
import { GithubIcon } from "@/components/github-icon";
import { Link, useRouterState } from "@tanstack/react-router";

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@aven/ui/sidebar";
import { CloudLine } from "@/components/cloud-line";
import { McpLine } from "@/components/mcp-line";
import { usePlatformConfig } from "@/modules/platform/hooks/use-platform-config";

const groups = [
  {
    label: "Personal",
    items: [
      { to: "/settings/general", label: "General", icon: SettingsIcon },
      { to: "/settings/profile", label: "Profile", icon: UserCircleIcon },
      { to: "/settings/environment-variables", label: "Personal variables", icon: LockIcon },
    ],
  },
  {
    label: "AI",
    items: [
      { to: "/settings/providers", label: "Providers", icon: SparklesIcon },
      { to: "/settings/bots", label: "Bots", icon: ChatRoundDotsIcon },
      { to: "/settings/memory", label: "Memory", icon: UserIdIcon },
    ],
  },
  {
    label: "Agents and integrations",
    items: [
      { to: "/settings/skills", label: "Skills", icon: BookIcon },
      { to: "/settings/mcp", label: "MCP Integrations", icon: McpLine },
      { to: "/settings/mcp-access", label: "MCP access", icon: ProgrammingIcon },
      { to: "/settings/webhooks", label: "Webhooks", icon: SignalIcon },
    ],
  },
  {
    label: "Workspace",
    items: [
      { to: "/settings/members", label: "Members", icon: UsersGroupRoundedIcon },
      { to: "/settings/github", label: "GitHub", icon: GithubIcon },
      { to: "/settings/runtimes", label: "Runtimes", icon: CodeSquareIcon },
      { to: "/settings/workspace-variables", label: "Workspace variables", icon: KeyIcon },
      { to: "/settings/decision-model", label: "Decision model", icon: FlagIcon },
    ],
  },
] as const;

const platformGroup = {
  label: "Platform",
  items: [
    { to: "/settings/platform", label: "Installation", icon: ServerIcon },
    { to: "/settings/sandbox", label: "Sandbox", icon: CloudLine },
    { to: "/settings/people", label: "People", icon: UsersGroupTwoRoundedIcon },
    { to: "/settings/announcements", label: "Announcements", icon: BellIcon },
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
