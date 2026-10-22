import { GitBranch } from "@mynaui/icons-react";

import { Badge } from "@/components/badge";
import { Button } from "@/components/button";

import { useThreadActions } from "../hooks/use-thread-actions";
import type { Thread } from "../types";

export function ThreadHeader({ thread }: { thread: Thread }) {
  const { archive, snooze, reopen } = useThreadActions();

  return (
    <header className="flex items-center gap-3 border-b px-6 py-3">
      <h1 className="min-w-0 flex-1 truncate text-sm font-medium">{thread.title}</h1>
      <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
        <GitBranch className="size-3.5" />
        {thread.repo}/{thread.branch}
      </span>
      <Badge variant="secondary" className="capitalize">
        {thread.mode}
      </Badge>
      <span className="text-xs text-muted-foreground" title="Context window used">
        {thread.contextUsed}% context
      </span>
      {thread.state === "open" ? (
        <>
          <Button variant="ghost" size="sm" onClick={() => snooze(thread.id)}>
            Snooze
          </Button>
          <Button variant="ghost" size="sm" onClick={() => archive(thread.id)}>
            Archive
          </Button>
        </>
      ) : (
        <>
          <Badge variant="outline" className="capitalize">
            {thread.state}
          </Badge>
          <Button variant="ghost" size="sm" onClick={() => reopen(thread.id)}>
            Reopen
          </Button>
        </>
      )}
    </header>
  );
}
