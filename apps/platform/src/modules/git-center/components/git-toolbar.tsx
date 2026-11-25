import {
  IconArchive,
  IconArrowDown,
  IconArrowUp,
  IconChevronDown,
  IconCloudDownload,
  IconGitBranch,
  IconGitPullRequest,
  IconHistory,
  IconRefresh,
  IconTrash,
} from "@tabler/icons-react";
import { cn } from "cn";

import type { GitActionPayload } from "@aven/protocol/types";
import { Badge } from "@aven/ui/badge";
import { Button } from "@aven/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@aven/ui/dropdown-menu";

import type { GitCenterSnapshot, GitCenterTarget } from "../types";

type Props = {
  snapshot: GitCenterSnapshot;
  target: GitCenterTarget;
  refreshing: boolean;
  busyAction: string | null;
  hygieneCount: number;
  onRefresh: () => void;
  onAction: (action: GitActionPayload) => void;
  onForcePush: () => void;
  onOpenCreateBranch: () => void;
  onOpenStash: () => void;
  onOpenReflog: () => void;
  onOpenHygiene: () => void;
  onOpenCreatePr: () => void;
};

export function GitToolbar({
  snapshot,
  target,
  refreshing,
  busyAction,
  hygieneCount,
  onRefresh,
  onAction,
  onForcePush,
  onOpenCreateBranch,
  onOpenStash,
  onOpenReflog,
  onOpenHygiene,
  onOpenCreatePr,
}: Props) {
  const isLive = snapshot.mode === "live";
  const activeThread =
    target.kind === "thread"
      ? (snapshot.threads.find((t) => t.id === target.threadId) ?? null)
      : null;
  const lockedByRun = activeThread?.running ?? false;
  const canMutate = isLive && !lockedByRun && (activeThread ? activeThread.canMutate : true);
  const currentBranch = activeThread?.branch ?? snapshot.headBranch;
  const busy = busyAction !== null;

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5 border-b border-border/70 bg-background px-3 py-1.5">
      <div
        className="mr-1 flex h-7 max-w-56 min-w-0 items-center gap-1.5 rounded-md border border-border/60 bg-muted/40 px-2.5 text-xs"
        title={currentBranch ?? undefined}
      >
        <IconGitBranch className="size-3.5 shrink-0 text-primary" />
        <span className="truncate font-mono font-medium text-foreground">
          {currentBranch ?? (snapshot.detached ? "HEAD (detached)" : "—")}
        </span>
      </div>

      {activeThread && (
        <Badge
          variant="secondary"
          className="h-7 max-w-44 truncate px-2 text-xs font-normal text-muted-foreground"
          title={activeThread.title}
        >
          Thread: {activeThread.title}
        </Badge>
      )}

      <div className="mx-0.5 hidden h-4 w-px bg-border/70 sm:block" />

      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          disabled={!canMutate || busy}
          onClick={() => onAction({ op: "fetch", prune: true })}
        >
          <IconCloudDownload className="size-3.5" />
          <span>Fetch</span>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="outline" size="sm" disabled={!canMutate || busy} />}
          >
            <IconArrowDown className="size-3.5" />
            <span>Pull</span>
            <IconChevronDown className="size-3 opacity-60" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => onAction({ op: "pull", strategy: "merge" })}>
              Pull (merge)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAction({ op: "pull", strategy: "rebase" })}>
              Pull (rebase)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAction({ op: "pull", strategy: "ff-only" })}>
              Pull (fast-forward only)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="outline" size="sm" disabled={!canMutate || busy} />}
          >
            <IconArrowUp className="size-3.5" />
            <span>Push</span>
            <IconChevronDown className="size-3 opacity-60" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => onAction({ op: "push" })}>Push</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAction({ op: "push", setUpstream: true })}>
              Push &amp; set upstream
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onForcePush}>
              Force push (--force-with-lease)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mx-0.5 hidden h-4 w-px bg-border/70 sm:block" />

      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          disabled={!canMutate || busy}
          onClick={onOpenCreateBranch}
        >
          <IconGitBranch className="size-3.5" />
          <span>Branch</span>
        </Button>

        <Button variant="outline" size="sm" disabled={!canMutate || busy} onClick={onOpenStash}>
          <IconArchive className="size-3.5" />
          <span>Stash</span>
        </Button>

        {snapshot.project.repoFullName && (
          <Button variant="outline" size="sm" disabled={busy} onClick={onOpenCreatePr}>
            <IconGitPullRequest className="size-3.5" />
            <span>New PR</span>
          </Button>
        )}
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1">
        <Button variant="ghost" size="sm" disabled={!isLive || busy} onClick={onOpenReflog}>
          <IconHistory className="size-3.5" />
          <span>Undo / Reflog</span>
        </Button>

        <Button variant="ghost" size="sm" disabled={!isLive || busy} onClick={onOpenHygiene}>
          <IconTrash className="size-3.5" />
          <span>Cleanup</span>
          {hygieneCount > 0 && (
            <Badge
              variant="secondary"
              className="ml-0.5 h-4 px-1.5 font-mono text-[11px] tabular-nums"
            >
              {hygieneCount}
            </Badge>
          )}
        </Button>

        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Refresh Git Center"
          title="Refresh Git Center"
          className="shrink-0"
          onClick={onRefresh}
        >
          <IconRefresh className={cn("size-3.5", refreshing && "animate-spin")} />
        </Button>
      </div>
    </div>
  );
}
