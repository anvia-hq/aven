import { IconFolder, IconGitBranch } from "@tabler/icons-react";
import { Link, useRouterState } from "@tanstack/react-router";

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@aven/ui/sidebar";
import { useProjects } from "@/modules/projects/hooks/use-projects";

export function GitShellSidebar() {
  const { projects } = useProjects();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <nav aria-label="Git Center" className="pt-4">
      <SidebarGroup className="py-1">
        <SidebarGroupLabel className="h-6 font-normal text-muted-foreground">
          Repositories
        </SidebarGroupLabel>
        {projects === null && (
          <div className="px-2 py-2 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
            Loading projects…
          </div>
        )}
        {projects !== null && projects.length === 0 && (
          <div className="px-2 py-2 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
            No projects yet. Add one in Projects.
          </div>
        )}
        {projects !== null && projects.length > 0 && (
          <SidebarMenu>
            {projects.map((project) => {
              const active = pathname === `/git/${project.id}`;
              return (
                <SidebarMenuItem key={project.id}>
                  <SidebarMenuButton
                    render={
                      <Link
                        to="/git/$projectId"
                        params={{ projectId: project.id }}
                        aria-current={active ? "page" : undefined}
                      />
                    }
                    isActive={active}
                    tooltip={project.name}
                  >
                    {project.repoFullName ? <IconGitBranch /> : <IconFolder />}
                    <span>{project.name}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        )}
      </SidebarGroup>
    </nav>
  );
}
