import { Folder } from "@mynaui/icons-react";
import { Link } from "@tanstack/react-router";

import { timeAgo } from "@/lib/format";
import { RuntimeBadge } from "@/modules/runtimes/components/runtime-badge";

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
      <span className="truncate font-medium">{project.name}</span>
      <span
        className="flex items-center gap-1.5 truncate font-mono text-xs text-muted-foreground"
        title={project.projectPath}
      >
        <Folder className="size-3.5 shrink-0" />
        {project.projectPath}
      </span>
      <RuntimeBadge runtimeId={project.runtimeId} />
      <p className="text-xs text-muted-foreground">Updated {timeAgo(project.updatedAt, true)}</p>
    </Link>
  );
}
