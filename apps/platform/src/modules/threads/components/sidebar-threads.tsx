import { Cloudy, Plus } from "@mynaui/icons-react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";

import { Button } from "@/components/button";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/sidebar";
import { useRuntimes } from "@/modules/runtimes/hooks/use-runtimes";

import { useThreads } from "../hooks/use-threads";
import type { Thread } from "../types";

export function SidebarThreads() {
  const navigate = useNavigate();
  const threads = useThreads().threads.filter((thread) => thread.state === "open");
  const { runtimes } = useRuntimes();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  function hostLabel(thread: Thread) {
    const host = runtimes.find((runtime) => runtime.id === thread.runtimeId)?.name ?? "a runner";
    return `${thread.running ? "Running" : "Hosted"} on ${host}`;
  }

  return (
    <>
      <div className="flex items-center justify-between px-4 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
        <span>Threads</span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="New thread"
          onClick={() => navigate({ to: "/threads" })}
        >
          <Plus />
        </Button>
      </div>
      <SidebarMenu className="px-2 group-data-[collapsible=icon]:hidden">
        {threads.map((thread) => (
          <SidebarMenuItem key={thread.id}>
            <SidebarMenuButton
              render={<Link to="/threads/$threadId" params={{ threadId: thread.id }} />}
              isActive={pathname === `/threads/${thread.id}`}
            >
              <Cloudy
                className={thread.running ? "animate-pulse" : "text-muted-foreground"}
                aria-label={hostLabel(thread)}
              />
              <span className="flex-1 truncate">{thread.title}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
        {threads.length === 0 && (
          <p className="px-2 py-1 text-xs text-muted-foreground">Nothing here.</p>
        )}
      </SidebarMenu>
    </>
  );
}
