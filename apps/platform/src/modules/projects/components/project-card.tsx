import { ArrowRight, GitBranch } from "@mynaui/icons-react";
import { Link } from "@tanstack/react-router";
import { cn } from "cn";

import { GithubMark } from "@/components/brand-icons";
import { Button, buttonVariants } from "@/components/button";
import { timeAgo } from "@/lib/format";
import { RuntimeBadge } from "@/modules/runtimes/components/runtime-badge";
import type { Thread } from "@/modules/threads/types";

import type { Project } from "../types";
import { ProjectTile } from "./project-tile";

type Props = {
  project: Project;
  palette?: number;
  threads: Thread[];
  selected: boolean;
  onSelect: (projectId?: string) => void;
};

export function ProjectCard({ project, palette, threads, selected, onSelect }: Props) {
  const own = threads.filter(
    (thread) => thread.projectId === project.id && thread.state !== "archived",
  );
  const working = own.filter((thread) => thread.running).length;

  return (
    <article
      className={cn(
        "group/project flex flex-col overflow-hidden rounded-xl border bg-card transition-colors",
        selected ? "border-foreground/25 bg-accent/30" : "hover:border-foreground/20",
      )}
    >
      <Button
        variant="ghost"
        aria-pressed={selected}
        onClick={() => onSelect(selected ? undefined : project.id)}
        className="h-auto items-start justify-start gap-3 rounded-none px-3 py-3 text-left font-normal whitespace-normal hover:bg-transparent"
      >
        <ProjectTile
          projectId={project.id}
          palette={palette}
          working={working > 0}
          className="size-10"
        />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate font-medium">{project.name}</span>
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <GithubMark className="size-3.5 shrink-0" />
            <span className="truncate">{project.repoFullName}</span>
          </span>
        </span>
      </Button>
      <div className="flex items-center justify-between gap-2 border-t px-3 py-2 text-xs text-muted-foreground">
        <span className="flex min-w-0 items-center gap-1">
          <GitBranch className="size-3.5 shrink-0" />
          <span className="truncate font-mono">{project.defaultBranch}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span
            className={cn("whitespace-nowrap", working > 0 && "text-foreground")}
            title={working > 0 ? `${working} working` : undefined}
          >
            {own.length} {own.length === 1 ? "thread" : "threads"}
          </span>
          <RuntimeBadge runtimeId={project.runtimeId} />
          <span className="whitespace-nowrap">{timeAgo(project.updatedAt, true)}</span>
          <Link
            to="/projects/$projectId"
            params={{ projectId: project.id }}
            aria-label={`Open ${project.name}`}
            title={`Open ${project.name}`}
            className={buttonVariants({
              variant: "ghost",
              size: "icon-xs",
              className: "-mr-1 text-muted-foreground group-hover/project:text-foreground",
            })}
          >
            <ArrowRight />
          </Link>
        </span>
      </div>
    </article>
  );
}
