import { Plus } from "@mynaui/icons-react";
import { Link } from "@tanstack/react-router";

import { Badge } from "@/components/badge";
import { buttonVariants } from "@/components/button";
import { shortTimeAgo } from "@/lib/format";

import { projectPlace } from "../place";
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
      <ul aria-label="Projects" className="columns-1 gap-4 lg:columns-2 2xl:columns-3">
        {entries.map(({ project, threads, working }) => (
          <li
            key={project.id}
            className="mb-4 flex break-inside-avoid flex-col overflow-hidden rounded-xl border bg-card"
          >
            <div className="flex items-center gap-1 pr-2">
              <Link
                to="/projects/$projectId"
                params={{ projectId: project.id }}
                className="flex min-w-0 flex-1 items-center gap-3 px-3 py-3 outline-none focus-visible:bg-muted/50"
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
                    <span className="truncate">{projectPlace(project)}</span>
                    <span aria-hidden>·</span>
                    <span className="shrink-0 font-mono">{project.defaultBranch ?? "folder"}</span>
                  </span>
                </span>
                <RunnerStatus
                  runtimeId={project.runtimeId}
                  className="max-w-28 shrink-0 text-xs text-muted-foreground"
                />
              </Link>
              <Link
                to="/threads"
                search={{ project: project.id }}
                aria-label={`New thread in ${project.name}`}
                className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
              >
                <Plus />
              </Link>
            </div>
            <ul aria-label={`Threads in ${project.name}`} className="flex flex-col border-t py-1">
              {threads.slice(0, limit).map((thread) => (
                <li key={thread.id}>
                  <Link
                    to="/threads/$threadId"
                    params={{ threadId: thread.id }}
                    className="flex items-center gap-2.5 px-3 py-1.5 text-sm outline-none hover:bg-muted/50 focus-visible:bg-muted/50"
                  >
                    <span className="flex size-4 shrink-0 items-center justify-center">
                      {thread.running ? (
                        <ProjectTile
                          projectId={project.id}
                          palette={palettes.get(project.id)}
                          working
                          className="size-4"
                        />
                      ) : (
                        <span
                          aria-hidden
                          className="size-1.5 rounded-full bg-muted-foreground/40"
                        />
                      )}
                    </span>
                    <span
                      className={
                        thread.running
                          ? "min-w-0 flex-1 truncate"
                          : "min-w-0 flex-1 truncate text-muted-foreground"
                      }
                    >
                      {thread.title}
                    </span>
                    {thread.state !== "open" && (
                      <Badge variant="secondary" className="h-4 px-1.5 text-[10px] capitalize">
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
                <li className="px-3 py-1.5 text-sm text-muted-foreground">No threads yet</li>
              )}
              {threads.length > limit && (
                <li>
                  <Link
                    to="/projects/$projectId"
                    params={{ projectId: project.id }}
                    className="flex py-1.5 pr-3 pl-9.5 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:text-foreground"
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
