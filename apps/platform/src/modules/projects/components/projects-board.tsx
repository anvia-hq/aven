import { IconPlus } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { cn } from "cn";

import { Badge } from "@aven/ui/badge";
import { buttonVariants } from "@aven/ui/button";
import { shortTimeAgo } from "@/lib/format";

import { projectPlace, projectPlaceShort } from "../place";
import type { ProjectActivity } from "../types";
import { ProjectTile } from "./project-tile";
import { RunnerStatus } from "./runner-status";

type Props = {
  entries: ProjectActivity[];
  palettes: Map<string, number>;
  limit?: number;
};

const SHOWN = 4;

export function ProjectsBoard({ entries, palettes, limit = SHOWN }: Props) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <ul
        aria-label="Projects"
        className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2 2xl:grid-cols-3 min-[120rem]:grid-cols-4"
      >
        {entries.map(({ project, threads, working }) => (
          <li
            key={project.id}
            className="group/card flex flex-col overflow-hidden rounded-xl border bg-card"
          >
            <div className="flex items-center gap-1 pr-2">
              <Link
                to="/projects/$projectId"
                params={{ projectId: project.id }}
                className="flex min-w-0 flex-1 items-center gap-3 px-3 py-3 outline-none focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset"
              >
                <ProjectTile
                  projectId={project.id}
                  palette={palettes.get(project.id)}
                  working={working > 0}
                  className="size-9"
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{project.name}</span>
                  <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                    <RunnerStatus
                      runtimeId={project.runtimeId}
                      className="max-w-28 shrink-0 text-xs text-muted-foreground"
                    />
                    <span aria-hidden>·</span>
                    <span className="truncate" title={projectPlace(project)}>
                      {projectPlaceShort(project)}
                    </span>
                    {project.defaultBranch && (
                      <span className="shrink-0 font-mono">{project.defaultBranch}</span>
                    )}
                  </span>
                </span>
              </Link>
              <Link
                to="/threads"
                search={{ project: project.id }}
                aria-label={`New thread in ${project.name}`}
                className={cn(
                  buttonVariants({ variant: "ghost", size: "icon-sm" }),
                  "text-muted-foreground opacity-60 transition-opacity group-focus-within/card:opacity-100 group-hover/card:opacity-100",
                )}
              >
                <IconPlus />
              </Link>
            </div>
            <ul
              aria-label={`Threads in ${project.name}`}
              className="mt-0.5 mb-3 ml-[29px] flex flex-col border-l pr-2 pl-5"
            >
              {threads.slice(0, limit).map((thread) => (
                <li key={thread.id}>
                  <Link
                    to="/threads/$threadId"
                    params={{ threadId: thread.id }}
                    className="relative flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm outline-none hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "absolute top-1/2 -left-[24.5px] size-2 -translate-y-1/2 rounded-full border-[1.5px]",
                        thread.running
                          ? "border-success bg-success"
                          : "border-muted-foreground/50 bg-card",
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate">{thread.title}</span>
                    {thread.state !== "open" && (
                      <Badge variant="secondary" className="h-4 px-1.5 text-[11px] capitalize">
                        {thread.state}
                      </Badge>
                    )}
                    <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                      {thread.running ? "working" : shortTimeAgo(thread.updatedAt)}
                    </span>
                  </Link>
                </li>
              ))}
              {threads.length === 0 && (
                <li className="px-2 py-1.5 text-sm text-muted-foreground">No threads yet</li>
              )}
              {threads.length > limit && (
                <li>
                  <Link
                    to="/projects/$projectId"
                    params={{ projectId: project.id }}
                    className="flex px-2 py-1.5 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:text-foreground"
                  >
                    {threads.length - limit} more
                  </Link>
                </li>
              )}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
