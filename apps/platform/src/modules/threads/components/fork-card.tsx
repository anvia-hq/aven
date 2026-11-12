import { GitBranch } from "@mynaui/icons-react";
import { Link } from "@tanstack/react-router";
import { cn } from "cn";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/avatar";
import { initials, shortTimeAgo, timeAgo } from "@/lib/format";

import { useThreads } from "../hooks/use-threads";
import type { ToolPart } from "../types";

export function ForkCard({ tool, forkId }: { tool: ToolPart; forkId: string }) {
  const { all } = useThreads();
  const fork = all.find((thread) => thread.id === forkId);
  const archived = fork?.state === "archived";
  let status = "Fork";

  if (fork) status = fork.running ? "Working" : "Idle";

  if (archived) status = "Archived";

  const body = (
    <>
      <span className="flex size-6 shrink-0 items-center justify-center text-primary">
        <GitBranch className={cn("size-5", fork?.running && "animate-pulse")} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{fork?.title ?? "Fork"}</span>
        <span className="truncate text-xs text-muted-foreground">
          <span className={cn(fork?.running && "shimmer")}>{status}</span>
          {tool.target && ` · ${tool.target}`}
        </span>
      </span>
      {fork && (
        <>
          <time
            dateTime={fork.updatedAt}
            title={timeAgo(fork.updatedAt, true)}
            className="shrink-0 text-xs text-muted-foreground tabular-nums"
          >
            {shortTimeAgo(fork.updatedAt)}
          </time>
          <Avatar size="sm" className="size-7">
            {fork.createdByImage && <AvatarImage src={fork.createdByImage} alt="" />}
            <AvatarFallback className="text-[10px]">{initials(fork.createdByName)}</AvatarFallback>
          </Avatar>
        </>
      )}
    </>
  );

  const frame =
    "flex w-full min-w-0 items-center gap-3 rounded-lg border bg-card px-3 py-2.5 text-left";

  if (!fork)
    return (
      <div className={frame} data-slot="fork-card">
        {body}
      </div>
    );

  return (
    <Link
      to="/threads/$threadId"
      params={{ threadId: fork.id }}
      data-slot="fork-card"
      className={cn(frame, "transition-colors hover:bg-muted/50")}
    >
      {body}
    </Link>
  );
}
