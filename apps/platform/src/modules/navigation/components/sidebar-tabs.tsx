import { Activity, Chat, Folder, Grid } from "@mynaui/icons-react";
import { Link, useRouterState } from "@tanstack/react-router";

const tabs = [
  { to: "/threads", label: "Threads", icon: Chat },
  { to: "/activity", label: "Activity", icon: Activity },
  { to: "/projects", label: "Projects", icon: Folder },
  { to: "/dashboard", label: "Dashboard", icon: Grid },
] as const;

export function SidebarTabs() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <nav
      aria-label="Sections"
      className="grid grid-cols-4 gap-1 group-data-[collapsible=icon]:grid-cols-1"
    >
      {tabs.map((tab) => {
        const active = pathname === tab.to || pathname.startsWith(`${tab.to}/`);
        return (
          <Link
            key={tab.to}
            to={tab.to}
            title={tab.label}
            className={`flex flex-col items-center gap-1 rounded-md px-1 py-2 text-xs hover:bg-sidebar-accent ${
              active ? "bg-sidebar-accent text-foreground" : "text-muted-foreground"
            }`}
          >
            <tab.icon className="size-5" />
            <span className="group-data-[collapsible=icon]:hidden">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
