import { GitBranch } from "@mynaui/icons-react";

import { Badge } from "@/components/badge";

import type { Thread } from "../types";

export function ThreadHeader({ thread }: { thread: Thread }) {
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
    </header>
  );
}
