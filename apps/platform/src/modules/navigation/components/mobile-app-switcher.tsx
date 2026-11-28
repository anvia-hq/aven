import { IconBolt, IconFolder, IconGitFork, IconInbox } from "@tabler/icons-react";
import { Link, useRouterState } from "@tanstack/react-router";

import { AvenMark } from "@/components/brand-icons";
import { BotLine } from "@/components/bot-line";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@aven/ui/sidebar";

const apps = [
  { to: "/threads", label: "Threads", prefix: "/threads" },
  { to: "/projects", label: "Projects", prefix: "/projects" },
  { to: "/automations", label: "Automations", prefix: "/automations" },
  { to: "/git", label: "Git Center", prefix: "/git" },
  { to: "/cockpit/inbox", label: "Cockpit", prefix: "/cockpit" },
  { to: "/bot", label: "Bot", prefix: "/bot" },
] as const;

function AppIcon({ prefix }: { prefix: (typeof apps)[number]["prefix"] }) {
  if (prefix === "/threads") return <AvenMark className="w-4 text-brand" />;

  if (prefix === "/projects") return <IconFolder />;

  if (prefix === "/automations") return <IconBolt />;

  if (prefix === "/git") return <IconGitFork />;

  if (prefix === "/cockpit") return <IconInbox />;

  return <BotLine className="size-4" />;
}

export function MobileAppSwitcher() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <nav aria-label="Apps" className="md:hidden">
      <SidebarMenu className="px-2">
        {apps.map((app) => (
          <SidebarMenuItem key={app.to}>
            <SidebarMenuButton
              render={<Link to={app.to} />}
              isActive={pathname.startsWith(app.prefix)}
            >
              <AppIcon prefix={app.prefix} />
              <span>{app.label}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </nav>
  );
}
