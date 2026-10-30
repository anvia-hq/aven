import { Cog, Servers, Sparkles, Terminal, Users } from "@mynaui/icons-react";
import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "cn";

import { usePlatformConfig } from "@/modules/platform/hooks/use-platform-config";

const groups = [
  {
    label: "Personal",
    items: [
      { to: "/settings/profile", label: "Profile", icon: Cog },
      { to: "/settings/providers", label: "Providers", icon: Sparkles },
    ],
  },
  {
    label: "Workspace",
    items: [
      { to: "/settings/members", label: "Members", icon: Users },
      { to: "/settings/runtimes", label: "Runtimes", icon: Terminal },
    ],
  },
] as const;

const platformGroup = {
  label: "Platform",
  items: [{ to: "/settings/platform", label: "Platform", icon: Servers }],
} as const;

export function SettingsNav() {
  const { config } = usePlatformConfig();
  const visibleGroups = config?.isOwner ? [...groups, platformGroup] : groups;
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <nav
      aria-label="Settings"
      className="flex gap-1 overflow-x-auto md:w-40 md:shrink-0 md:flex-col md:gap-4 md:overflow-visible"
    >
      {visibleGroups.map((group) => (
        <div key={group.label} className="flex gap-1 md:flex-col">
          <p className="hidden px-2 text-xs text-muted-foreground md:block">{group.label}</p>
          {group.items.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-muted",
                pathname === item.to ? "bg-muted font-medium" : "text-muted-foreground",
              )}
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}
