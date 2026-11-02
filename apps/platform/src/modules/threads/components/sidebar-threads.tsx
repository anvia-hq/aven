import { Archive, Plus } from "@mynaui/icons-react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";

import { Button } from "@/components/button";
import {
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/sidebar";
import { ProjectTile } from "@/modules/projects/components/project-tile";
import { useProjectPalettes } from "@/modules/projects/hooks/use-project-palettes";
import { useProjects } from "@/modules/projects/hooks/use-projects";
import type { Project } from "@/modules/projects/types";
import { useRuntimes } from "@/modules/runtimes/hooks/use-runtimes";

import { useArchiveThread } from "../hooks/use-archive-thread";
import { useThreads } from "../hooks/use-threads";
import type { Thread } from "../types";

const RUNNING_REFRESH_MS = 5000;

// The thread's project as a tile, pulsing while the thread runs. Until the project is known the
// tile's place is kept, so a row does not show a question mark and then change.
function SidebarProjectTile({
  thread,
  project,
  palette,
}: {
  thread: Thread;
  project?: Project;
  palette?: number;
}) {
  if (!project) return <span className="size-4 shrink-0" aria-hidden />;
  return (
    <ProjectTile
      projectId={project.id}
      palette={palette}
      name={project.name}
      className={thread.running ? "animate-pulse" : undefined}
    />
  );
}

export function SidebarThreads() {
  const navigate = useNavigate();
  const { threads: own, shared: others, refresh } = useThreads();
  const threads = own.filter((thread) => thread.state === "open");
  // What the workspace shares to read (decision 0084), which its creator can still archive.
  const shared = others.filter((thread) => thread.state === "open");
  const { runtimes } = useRuntimes();
  const { projects } = useProjects();
  const palettes = useProjectPalettes();
  const archive = useArchiveThread();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  // Only the open thread has a stream to hear its run end on. While a thread is shown as running,
  // the list is asked again now and then, so another thread's tile stops pulsing when its run ends.
  const anyRunning = [...own, ...others].some((thread) => thread.running);
  useEffect(() => {
    if (!anyRunning) return;
    const timer = setInterval(() => void refresh(), RUNNING_REFRESH_MS);
    return () => clearInterval(timer);
  }, [anyRunning, refresh]);

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
              <SidebarProjectTile
                thread={thread}
                project={projects.find((candidate) => candidate.id === thread.projectId)}
                palette={palettes.get(thread.projectId)}
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
      {shared.length > 0 && (
        <>
          <div className="px-4 pt-2 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
            Shared with workspace
          </div>
          <SidebarMenu className="px-2 group-data-[collapsible=icon]:hidden">
            {shared.map((thread) => (
              <SidebarMenuItem key={thread.id}>
                <SidebarMenuButton
                  render={<Link to="/threads/$threadId" params={{ threadId: thread.id }} />}
                  isActive={pathname === `/threads/${thread.id}`}
                >
                  <SidebarProjectTile
                    thread={thread}
                    project={projects.find((candidate) => candidate.id === thread.projectId)}
                    palette={palettes.get(thread.projectId)}
                  />
                  <span className="flex-1 truncate" title={`Shared by ${thread.createdByName}`}>
                    {thread.title}
                  </span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </>
      )}
    </>
  );
}
