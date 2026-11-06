import { GitBranch } from "@mynaui/icons-react";
import { Link } from "@tanstack/react-router";

import { GithubMark } from "@/components/brand-icons";
import { timeAgo } from "@/lib/format";
import { RuntimeBadge } from "@/modules/runtimes/components/runtime-badge";

import type { Project } from "../types";
import { ProjectTile } from "./project-tile";

type Props = {
  project: Project;
  /** Its palette among the person's projects (`useProjectPalettes`). */
  palette?: number;
};

// A project as a card: its tile, name and the runner that hosts it, then the GitHub repository it
// was imported from, and the branch and when it last changed.
export function ProjectCard({ project, palette }: Props) {
  return (
    <Link
      to="/projects/$projectId"
      params={{ projectId: project.id }}
      className="group/project flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card transition-colors hover:border-foreground/20 hover:bg-accent/40"
    >
      <div className="flex items-start gap-3 p-4">
        <ProjectTile projectId={project.id} palette={palette} className="size-11" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate font-medium">{project.name}</span>
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <GithubMark className="size-3.5 shrink-0" />
            <span className="truncate">{project.repoFullName}</span>
          </span>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 border-t px-4 py-3 text-xs text-muted-foreground">
        <span className="flex min-w-0 items-center gap-1">
          <GitBranch className="size-3.5 shrink-0" />
          <span className="truncate font-mono">{project.defaultBranch}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <RuntimeBadge runtimeId={project.runtimeId} />
          <span>{timeAgo(project.updatedAt, true)}</span>
        </span>
      </div>
    </Link>
  );
}
