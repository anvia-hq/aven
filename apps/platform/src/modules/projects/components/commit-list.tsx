import { CheckCircle, XCircle } from "@mynaui/icons-react";

import { Avatar, AvatarFallback } from "@/components/avatar";
import { timeAgo } from "@/lib/format";

import type { Commit } from "../types";

export function CommitList({ commits, branch }: { commits: Commit[]; branch: string }) {
  return (
    <section aria-label="Commits" className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold">Commits to {branch}</h2>
      <ul className="flex min-h-40 flex-col divide-y rounded-lg border">
        {commits.map((commit) => (
          <li key={commit.hash} className="flex items-center gap-3 px-4 py-3">
            <Avatar size="sm">
              <AvatarFallback>{commit.author.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm">{commit.message}</span>
              <span className="truncate text-xs text-muted-foreground">
                {commit.author} · <span className="font-mono">{commit.hash}</span>
              </span>
            </div>
            <span className="text-xs text-muted-foreground">{timeAgo(commit.at)}</span>
            {commit.ci === "pass" && (
              <CheckCircle className="size-4 text-success" aria-label="CI passed" />
            )}
            {commit.ci === "fail" && (
              <XCircle className="size-4 text-destructive" aria-label="CI failed" />
            )}
          </li>
        ))}
        {commits.length === 0 && (
          <li className="p-4 text-sm text-muted-foreground">No commits yet.</li>
        )}
      </ul>
    </section>
  );
}
