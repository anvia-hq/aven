import { GitBranch } from "@mynaui/icons-react";
import { Link } from "@tanstack/react-router";

import { Badge } from "@/components/badge";
import { timeAgo } from "@/lib/format";

import type { Project } from "../types";

type Props = {
  project: Project;
};

export function ProjectCard({ project }: Props) {
  return (
    <Link
      to="/projects/$projectId"
      params={{ projectId: project.id }}
      className="flex flex-col gap-3 rounded-xl border bg-card p-4 transition-colors hover:bg-muted/40"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-medium">{project.name}</span>
        {project.status === "archived" && <Badge variant="secondary">Archived</Badge>}
      </div>
      <p className="line-clamp-2 min-h-10 text-sm text-muted-foreground">{project.description}</p>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span>{project.language}</span>
        <span className="flex items-center gap-1">
          <GitBranch className="size-3.5" />
          {project.defaultBranch}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">Updated {timeAgo(project.updatedAt, true)}</p>
    </Link>
  );
}
