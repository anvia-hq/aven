import { Folder } from "@mynaui/icons-react";
import { Link, useRouterState } from "@tanstack/react-router";

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/sidebar";
import { ProjectTile } from "@/modules/projects/components/project-tile";
import { useProjectPalettes } from "@/modules/projects/hooks/use-project-palettes";
import { useProjects } from "@/modules/projects/hooks/use-projects";

// What Center's sidebar lists: all the projects together, then each one to look at by itself.
export function CenterSidebar() {
  const { projects } = useProjects();
  const palettes = useProjectPalettes();
  const selected = useRouterState({
    select: (state) => (state.location.search as { project?: string }).project,
  });

  return (
    <nav aria-label="Center">
      <SidebarGroup className="py-1">
        <SidebarGroupLabel>Center</SidebarGroupLabel>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={<Link to="/center" search={{}} />}
              isActive={selected === undefined}
              tooltip="All projects"
            >
              <Folder />
              <span>All projects</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroup>
      <SidebarGroup className="py-1">
        <SidebarGroupLabel>Projects</SidebarGroupLabel>
        <SidebarMenu aria-label="Projects">
          {projects.map((project) => (
            <SidebarMenuItem key={project.id}>
              <SidebarMenuButton
                render={<Link to="/center" search={{ project: project.id }} />}
                isActive={selected === project.id}
                tooltip={project.name}
              >
                <ProjectTile
                  projectId={project.id}
                  palette={palettes.get(project.id)}
                  name={project.name}
                />
                <span className="truncate">{project.name}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
          {projects.length === 0 && (
            <p className="px-2 py-1 text-xs text-muted-foreground">No projects yet.</p>
          )}
        </SidebarMenu>
      </SidebarGroup>
    </nav>
  );
}
