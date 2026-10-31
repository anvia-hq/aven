import {
  ArrowLeft,
  BookOpen,
  ChatDots,
  Cog,
  Key,
  Servers,
  Sparkles,
  Terminal,
  Users,
} from "@mynaui/icons-react";
import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "cn";
import type { CSSProperties } from "react";

import { Avatar, AvatarFallback } from "@/components/avatar";
import { initials } from "@/lib/format";
import { useSidebarWidth } from "@/modules/navigation/hooks/use-sidebar-width";
import { usePlatformConfig } from "@/modules/platform/hooks/use-platform-config";

const groups = [
  {
    label: "Personal",
    items: [
      { to: "/settings/profile", label: "Profile", icon: Cog },
      { to: "/settings/providers", label: "Providers", icon: Sparkles },
      { to: "/settings/bots", label: "Bots", icon: ChatDots },
      { to: "/settings/skills", label: "Skills", icon: BookOpen },
      { to: "/settings/environment-variables", label: "Environment variables", icon: Key },
    ],
  },
  {
    label: "Workspace",
    items: [
      { to: "/settings/members", label: "Members", icon: Users },
      { to: "/settings/runtimes", label: "Runtimes", icon: Terminal },
      { to: "/settings/workspace-variables", label: "Variables", icon: Key },
    ],
  },
] as const;

const platformGroup = {
  label: "Platform",
  items: [{ to: "/settings/platform", label: "Platform", icon: Servers }],
} as const;

// The metrics of the thread sidebar's menu buttons, so the two read as the same kind of list.
const itemClass =
  "flex h-8 w-full items-center gap-2 rounded-md p-2 text-left text-sm outline-hidden transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring data-active:bg-sidebar-accent data-active:text-sidebar-accent-foreground [&_svg]:size-4 [&_svg]:shrink-0";

type Props = {
  name: string;
  email: string;
};

export function SettingsNav({ name, email }: Props) {
  const { width } = useSidebarWidth();
  const { config } = usePlatformConfig();
  const visibleGroups = config?.isOwner ? [...groups, platformGroup] : groups;
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <aside
      // The width the thread sidebar was last resized to, so the two line up.
      style={{ "--rail-width": `${width}px` } as CSSProperties}
      className="flex shrink-0 flex-col gap-2 border-b bg-sidebar py-2 text-sidebar-foreground/80 md:h-full md:w-(--rail-width) md:border-r md:border-b-0"
    >
      <div className="px-2">
        <Link to="/" className={cn(itemClass, "text-muted-foreground")}>
          <ArrowLeft />
          Back to Aven
        </Link>
      </div>
      <nav
        aria-label="Settings"
        className="flex flex-1 gap-1 overflow-x-auto px-2 md:flex-col md:gap-3 md:overflow-visible"
      >
        {visibleGroups.map((group) => (
          <div key={group.label} className="flex gap-1 md:flex-col md:gap-0.5">
            <p className="hidden px-2 text-xs text-muted-foreground md:block">{group.label}</p>
            {group.items.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                aria-current={pathname === item.to ? "page" : undefined}
                data-active={pathname === item.to ? "" : undefined}
                className={cn(itemClass, "shrink-0")}
              >
                <item.icon />
                {item.label}
              </Link>
            ))}
          </div>
        ))}
      </nav>
      <div className="hidden items-center gap-2 border-t px-4 pt-2 md:flex">
        <Avatar size="sm">
          <AvatarFallback>{initials(name)}</AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-xs font-medium">{name}</span>
          <span className="truncate text-xs text-muted-foreground">{email}</span>
        </div>
      </div>
    </aside>
  );
}
