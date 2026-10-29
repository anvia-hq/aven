import { Cog, Servers, Sparkles, Users } from "@mynaui/icons-react";
import { Link, useRouterState } from "@tanstack/react-router";

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
    items: [{ to: "/settings/members", label: "Members", icon: Users }],
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
    <nav aria-label="Settings" className="flex flex-col gap-6 md:w-52">
      {visibleGroups.map((group) => (
        <div key={group.label} className="flex flex-col gap-1">
          <p className="px-2 text-xs font-medium text-muted-foreground">{group.label}</p>
          {group.items.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted ${
                pathname === item.to ? "bg-muted font-medium" : "text-muted-foreground"
              }`}
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
