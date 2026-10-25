import { GitBranch } from "@mynaui/icons-react";
import { Link } from "@tanstack/react-router";

import { Badge } from "@/components/badge";
import { timeAgo } from "@/lib/format";

import type { Thread } from "../types";

export function ThreadList({ threads, empty }: { threads: Thread[]; empty?: string }) {
  return (
    <ul className="flex flex-col divide-y overflow-hidden rounded-xl border">
      {threads.map((thread) => (
        <li key={thread.id}>
          <Link
            to="/threads/$threadId"
            params={{ threadId: thread.id }}
            className="flex items-center gap-4 px-4 py-3 hover:bg-muted/50"
          >
            <span className="flex-1 truncate text-sm font-medium">{thread.title}</span>
            {thread.state !== "open" && (
              <Badge variant="secondary" className="capitalize">
                {thread.state}
              </Badge>
            )}
            <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
              <GitBranch className="size-3.5" />
              {thread.branch}
            </span>
            <span className="w-24 text-right text-xs text-muted-foreground">
              {timeAgo(thread.updatedAt, true)}
            </span>
          </Link>
        </li>
      ))}
      {threads.length === 0 && empty && (
        <li className="p-5 text-sm text-muted-foreground">{empty}</li>
      )}
    </ul>
  );
}
