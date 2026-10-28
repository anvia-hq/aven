import { Plus, Spinner } from "@mynaui/icons-react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";

import { Button } from "@/components/button";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/sidebar";

import { useThreads } from "../hooks/use-threads";

export function SidebarThreads() {
  const navigate = useNavigate();
  const threads = useThreads().threads.filter((thread) => thread.state === "open");
  const pathname = useRouterState({ select: (state) => state.location.pathname });

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
              <span className="flex-1 truncate">{thread.title}</span>
              {thread.running && <Spinner className="animate-spin" />}
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
