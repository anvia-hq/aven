import { Chat, GitCommit, Users } from "@mynaui/icons-react";
import { Link } from "@tanstack/react-router";

import type { ActivityEvent, ActivityKind } from "../types";
import { timeAgo } from "@/lib/format";

const icons: Record<ActivityKind, typeof Chat> = {
  thread: Chat,
  commit: GitCommit,
  team: Users,
};

export function ActivityItem({ event }: { event: ActivityEvent }) {
  const Icon = icons[event.kind];
  const body = (
    <>
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border bg-card text-muted-foreground">
        <Icon className="size-4" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-medium">{event.title}</span>
        <span className="truncate text-sm text-muted-foreground">{event.detail}</span>
      </div>
      <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(event.at, true)}</span>
    </>
  );

  return event.threadId ? (
    <Link
      to="/threads/$threadId"
      params={{ threadId: event.threadId }}
      className="flex items-start gap-3 rounded-lg px-3 py-3 hover:bg-muted/50"
    >
      {body}
    </Link>
  ) : (
    <div className="flex items-start gap-3 px-3 py-3">{body}</div>
  );
}
