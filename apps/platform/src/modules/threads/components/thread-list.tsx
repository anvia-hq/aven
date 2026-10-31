import { Folder } from "@mynaui/icons-react";
import { Link } from "@tanstack/react-router";

import { Badge } from "@/components/badge";
import { timeAgo } from "@/lib/format";
import { useProjects } from "@/modules/projects/hooks/use-projects";

import type { Thread } from "../types";

export function ThreadList({ threads, empty }: { threads: Thread[]; empty?: string }) {
  const { projects } = useProjects();

  return (
    <ul className="flex flex-col gap-0.5">
      {threads.map((thread) => (
        <li key={thread.id}>
          <Link
            to="/threads/$threadId"
            params={{ threadId: thread.id }}
            className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-muted/50"
          >
            <span className="min-w-0 flex-1 truncate text-sm">{thread.title}</span>
            {thread.state !== "open" && (
              <Badge variant="secondary" className="capitalize">
                {thread.state}
              </Badge>
            )}
            <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
              <Folder className="size-3.5" />
              {projects.find((project) => project.id === thread.projectId)?.name}
            </span>
            <span className="shrink-0 text-right text-xs whitespace-nowrap text-muted-foreground">
              {timeAgo(thread.updatedAt, true)}
            </span>
          </Link>
        </li>
      ))}
      {threads.length === 0 && empty && (
        <li className="p-3 text-sm text-muted-foreground">{empty}</li>
      )}
    </ul>
  );
}
