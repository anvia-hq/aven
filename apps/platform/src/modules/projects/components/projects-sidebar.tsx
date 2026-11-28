import { IconActivity, IconFolder, IconUser } from "@tabler/icons-react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useMemo } from "react";

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@aven/ui/sidebar";
import { authClient } from "@/lib/auth-client";
import { useThreads } from "@/modules/threads/hooks/use-threads";

import { filterProjects } from "../filters";
import { useProjectPalettes } from "../hooks/use-project-palettes";
import { useProjects } from "../hooks/use-projects";
import type { ProjectsSearch, ProjectsView } from "../types";
import { ProjectTile } from "./project-tile";

export function ProjectsSidebar() {
  const { projects, loaded } = useProjects();
  const { all: threads } = useThreads();
  const { data: session } = authClient.useSession();
  const palettes = useProjectPalettes();
  const location = useRouterState({
    select: (state) => ({
      pathname: state.location.pathname,
      search: state.location.search as ProjectsSearch,
    }),
  });

  const me = session?.user.id;
  const running = useMemo(
    () => new Set(threads.flatMap((thread) => (thread.running ? [thread.projectId] : []))),
    [threads],
  );

  const isIndex = location.pathname === "/projects" || location.pathname === "/projects/";
  const activeView: ProjectsView = location.search.view ?? "all";

  const mineCount = filterProjects(projects, { view: "mine" }, { me, running }).length;
  const workingCount = filterProjects(projects, { view: "working" }, { me, running }).length;

  const views = [
    { id: "all" as const, label: "All", icon: IconFolder, count: projects.length },
    { id: "mine" as const, label: "Mine", icon: IconUser, count: mineCount },
    { id: "working" as const, label: "Working", icon: IconActivity, count: workingCount },
  ];

  const preserved = {
    q: location.search.q,
    runner: location.search.runner,
  };

  return (
    <>
      <nav aria-label="Projects" className="pt-4">
        <SidebarGroup className="py-1">
          <SidebarGroupLabel className="h-6 font-normal text-muted-foreground">
            Views
          </SidebarGroupLabel>
          <SidebarMenu>
            {views.map((view) => {
              const active = isIndex && activeView === view.id;
              return (
                <SidebarMenuItem key={view.id}>
                  <SidebarMenuButton
                    render={
                      <Link
                        to="/projects"
                        search={view.id === "all" ? preserved : { ...preserved, view: view.id }}
                        aria-current={active ? "page" : undefined}
                      />
                    }
                    isActive={active}
                    tooltip={view.label}
                  >
                    <view.icon />
                    <span>{view.label}</span>
                  </SidebarMenuButton>
                  {view.count > 0 && (
                    <SidebarMenuBadge className="tabular-nums">{view.count}</SidebarMenuBadge>
                  )}
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup className="py-1">
          <SidebarGroupLabel className="h-6 font-normal text-muted-foreground">
            Projects
          </SidebarGroupLabel>
          {!loaded && (
            <div className="px-2 py-2 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
              Loading projects…
            </div>
          )}
          {loaded && projects.length === 0 && (
            <div className="px-2 py-2 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
              No projects yet.
            </div>
          )}
          {loaded && projects.length > 0 && (
            <SidebarMenu aria-label="Project directory">
              {projects.map((project) => {
                const active = location.pathname === `/projects/${project.id}`;
                const working = running.has(project.id);
                return (
                  <SidebarMenuItem key={project.id}>
                    <SidebarMenuButton
                      render={
                        <Link
                          to="/projects/$projectId"
                          params={{ projectId: project.id }}
                          aria-current={active ? "page" : undefined}
                        />
                      }
                      isActive={active}
                      tooltip={project.name}
                    >
                      <ProjectTile
                        projectId={project.id}
                        palette={palettes.get(project.id)}
                        working={working}
                        className="size-4 shrink-0"
                      />
                      <span className="min-w-0 flex-1 truncate">{project.name}</span>
                      {working && (
                        <span
                          aria-hidden="true"
                          className="size-1.5 shrink-0 animate-pulse rounded-full bg-success"
                        />
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          )}
        </SidebarGroup>
      </nav>
    </>
  );
}
