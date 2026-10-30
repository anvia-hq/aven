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
      className="flex min-w-0 flex-col gap-1.5 rounded-lg border p-3 transition-colors hover:bg-muted/40"
    >
      <span className="truncate font-medium">{project.name}</span>
      <span className="truncate text-xs text-muted-foreground">{project.repoFullName}</span>
      <RuntimeBadge runtimeId={project.runtimeId} />
      <p className="text-xs text-muted-foreground">Updated {timeAgo(project.updatedAt, true)}</p>
    </Link>
  );
}
