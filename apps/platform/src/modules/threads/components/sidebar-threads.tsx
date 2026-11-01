import { Archive, Plus } from "@mynaui/icons-react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";

import { Button } from "@/components/button";
import {
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/sidebar";
import { ProjectTile } from "@/modules/projects/components/project-tile";
import { useProjects } from "@/modules/projects/hooks/use-projects";
import { useRuntimes } from "@/modules/runtimes/hooks/use-runtimes";

import { useArchiveThread } from "../hooks/use-archive-thread";
import { useThreads } from "../hooks/use-threads";
import type { Thread } from "../types";

export function SidebarThreads() {
  const navigate = useNavigate();
  const threads = useThreads().threads.filter((thread) => thread.state === "open");
  const { runtimes } = useRuntimes();
  const { projects } = useProjects();
  const archive = useArchiveThread();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  function projectName(thread: Thread) {
    return projects.find((project) => project.id === thread.projectId)?.name ?? "";
  }

  function hostLabel(thread: Thread) {
    const host = runtimes.find((runtime) => runtime.id === thread.runtimeId)?.name ?? "a runner";
    return `${thread.running ? "Running" : "Hosted"} on ${host}`;
  }

  return (
    <>
      <div className="flex items-center justify-between pr-2 pl-4 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
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
              <ProjectTile
                projectId={thread.projectId}
                name={projectName(thread)}
                className={thread.running ? "animate-pulse" : undefined}
              />
              <span className="flex-1 truncate" title={hostLabel(thread)}>
                {thread.title}
              </span>
            </SidebarMenuButton>
            <SidebarMenuAction
              showOnHover
              aria-label={`Archive ${thread.title}`}
              title="Archive"
              onClick={() => void archive(thread)}
            >
              <Archive />
            </SidebarMenuAction>
          </SidebarMenuItem>
        ))}
        {threads.length === 0 && (
          <p className="px-2 py-1 text-xs text-muted-foreground">Nothing here.</p>
        )}
      </SidebarMenu>
    </>
  );
}
