import { IconGitBranch, IconGitFork, IconFolder } from "@tabler/icons-react";
import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "cn";

import { useProjects } from "@/modules/projects/hooks/use-projects";

export function GitShellSidebar() {
  const { projects } = useProjects();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <div className="flex flex-col gap-1 px-2 py-2">
      <div className="flex items-center gap-1.5 px-2 py-1 text-[0.6875rem] font-semibold tracking-wider text-muted-foreground uppercase">
        <IconGitFork className="size-3.5" />
        <span>Repositories</span>
      </div>
      {projects === null && (
        <div className="px-2 py-2 text-xs text-muted-foreground">Loading projects…</div>
      )}
      {projects !== null && projects.length === 0 && (
        <div className="px-2 py-2 text-xs text-muted-foreground">
          No projects yet. Add one in Projects.
        </div>
      )}
      {projects !== null &&
        projects.map((project) => {
          const active = pathname === `/git/${project.id}`;
          return (
            <Link
              key={project.id}
              to="/git/$projectId"
              params={{ projectId: project.id }}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                active && "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
              )}
            >
              {project.repoFullName ? (
                <IconGitBranch className="size-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <IconFolder className="size-3.5 shrink-0 text-muted-foreground" />
              )}
              <span className="min-w-0 flex-1 truncate">{project.name}</span>
            </Link>
          );
        })}
    </div>
  );
}
