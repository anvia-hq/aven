import {
  IconArchive,
  IconChevronDown,
  IconChevronRight,
  IconCloud,
  IconExternalLink,
  IconFolder,
  IconGitBranch,
  IconGitPullRequest,
  IconMessageCircle,
  IconTag,
} from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { cn } from "cn";
import { useState, type ReactNode } from "react";

import type { GitActionPayload } from "@aven/protocol/types";
import { Badge } from "@aven/ui/badge";
import { Button } from "@aven/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@aven/ui/context-menu";
import { Spinner } from "@aven/ui/spinner";

import { wipTotalFiles } from "../graph-rows";
import type { GitCenterInspector, GitCenterSnapshot, GitCenterTarget } from "../types";

type Props = {
  snapshot: GitCenterSnapshot;
  target: GitCenterTarget;
  inspector: GitCenterInspector;
  branchFilter: string | null;
  onSelectTarget: (target: GitCenterTarget) => void;
  onSelectInspector: (inspector: GitCenterInspector) => void;
  onFilterBranch: (branch: string | null) => void;
  onAction: (action: GitActionPayload) => void;
  onConfirmDeleteBranch: (name: string, deleteRemote?: boolean) => void;
  onRenameBranch: (name: string) => void;
  onStartThreadFromRef: (ref: string) => void;
};

function Section({
  title,
  count,
  defaultOpen = true,
  children,
}: {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border/60 py-1.5">
      <Button
        variant="ghost"
        size="xs"
        className="h-6 w-full justify-start gap-1 px-2 text-[0.6875rem] font-semibold tracking-wider text-muted-foreground uppercase"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <IconChevronDown className="size-3" /> : <IconChevronRight className="size-3" />}
        <span className="flex-1 text-left">{title}</span>
        {count !== undefined && <span className="font-mono text-[0.625rem]">{count}</span>}
      </Button>
      {open && <div className="mt-0.5 flex flex-col gap-0.5 px-1">{children}</div>}
    </div>
  );
}

export function GitRefsSidebar({
  snapshot,
  target,
  inspector,
  branchFilter,
  onSelectTarget,
  onSelectInspector,
  onFilterBranch,
  onAction,
  onConfirmDeleteBranch,
  onRenameBranch,
  onStartThreadFromRef,
}: Props) {
  const isLive = snapshot.mode === "live";
  const prByBranch = new Map(snapshot.pulls.map((p) => [p.head, p]));
  const baseDirty = wipTotalFiles(snapshot.wip);

  return (
    <aside className="flex h-full w-52 shrink-0 flex-col overflow-y-auto border-r border-border bg-card/50 text-xs 2xl:w-60">
      <Section title="Workspaces" count={1 + snapshot.threads.length}>
        <Button
          variant="ghost"
          size="xs"
          className={cn(
            "h-auto w-full justify-start gap-1.5 px-2 py-1.5 font-normal",
            target.kind === "project" &&
              inspector.kind === "wip" &&
              "bg-accent text-accent-foreground",
          )}
          onClick={() => {
            onSelectTarget({ kind: "project" });
            onSelectInspector({ kind: "wip" });
          }}
        >
          <IconFolder className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate font-medium">Project Repo</span>
          {baseDirty > 0 && (
            <Badge variant="secondary" className="h-4 px-1 font-mono text-[0.625rem]">
              {baseDirty}
            </Badge>
          )}
        </Button>

        {snapshot.threads.map((thread) => {
          const active = target.kind === "thread" && target.threadId === thread.id;
          const dirty = wipTotalFiles(thread.wip);
          return (
            <div
              key={thread.id}
              className={cn(
                "group flex items-center gap-1 rounded-md pr-1",
                active ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
              )}
            >
              <Button
                variant="ghost"
                size="xs"
                className="h-auto min-w-0 flex-1 justify-start gap-1.5 px-2 py-1.5 font-normal hover:bg-transparent"
                onClick={() => {
                  onSelectTarget({ kind: "thread", threadId: thread.id });
                  onSelectInspector({ kind: "wip" });
                }}
              >
                {thread.running ? (
                  <Spinner className="size-3 shrink-0" />
                ) : (
                  <IconMessageCircle className="size-3.5 shrink-0 text-muted-foreground" />
                )}
                <div className="min-w-0 flex-1 text-left">
                  <div className="truncate">{thread.title}</div>
                  {thread.branch && (
                    <div className="truncate font-mono text-[0.625rem] text-muted-foreground">
                      {thread.branch}
                    </div>
                  )}
                </div>
                {dirty > 0 && (
                  <Badge variant="secondary" className="h-4 px-1 font-mono text-[0.625rem]">
                    {dirty}
                  </Badge>
                )}
              </Button>
              <Link
                to="/threads/$threadId"
                params={{ threadId: thread.id }}
                title="Open thread"
                className="p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground"
              >
                <IconExternalLink className="size-3" />
              </Link>
            </div>
          );
        })}
      </Section>

      <Section title="Local Branches" count={snapshot.branches.length}>
        {branchFilter && (
          <Button
            variant="ghost"
            size="xs"
            className="h-6 justify-start px-2 text-[0.6875rem] text-primary"
            onClick={() => onFilterBranch(null)}
          >
            Show all branches
          </Button>
        )}
        {snapshot.branches.map((branch) => {
          const pr = prByBranch.get(branch.name);
          const filtered = branchFilter === branch.name;
          return (
            <ContextMenu key={branch.name}>
              <ContextMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="xs"
                    className={cn(
                      "h-auto w-full justify-start gap-1.5 px-2 py-1 font-normal",
                      filtered && "bg-accent text-accent-foreground",
                    )}
                    onClick={() => onFilterBranch(filtered ? null : branch.name)}
                    onDoubleClick={() => {
                      if (isLive && !branch.current) {
                        onAction({ op: "checkout", ref: branch.name });
                      }
                    }}
                  />
                }
              >
                <IconGitBranch
                  className={cn(
                    "size-3.5 shrink-0",
                    branch.current ? "text-primary" : "text-muted-foreground",
                  )}
                />
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-left font-mono text-[0.75rem]",
                    branch.current && "font-semibold text-foreground",
                  )}
                >
                  {branch.name}
                </span>
                {(branch.ahead > 0 || branch.behind > 0) && (
                  <span className="shrink-0 font-mono text-[0.625rem] text-muted-foreground">
                    {branch.ahead > 0 ? `↑${branch.ahead}` : ""}
                    {branch.behind > 0 ? `↓${branch.behind}` : ""}
                  </span>
                )}
                {pr && (
                  <Badge variant="outline" className="h-4 px-1 font-mono text-[0.625rem]">
                    #{pr.number}
                  </Badge>
                )}
              </ContextMenuTrigger>
              <ContextMenuContent>
                {isLive && !branch.current && (
                  <ContextMenuItem onClick={() => onAction({ op: "checkout", ref: branch.name })}>
                    Checkout {branch.name}
                  </ContextMenuItem>
                )}
                <ContextMenuItem onClick={() => onFilterBranch(filtered ? null : branch.name)}>
                  {filtered ? "Clear branch filter" : "Filter graph to branch"}
                </ContextMenuItem>
                <ContextMenuItem onClick={() => onStartThreadFromRef(branch.name)}>
                  Start thread from {branch.name}
                </ContextMenuItem>
                {isLive && !branch.current && (
                  <>
                    <ContextMenuSeparator />
                    <ContextMenuItem onClick={() => onAction({ op: "merge", ref: branch.name })}>
                      Merge {branch.name} into current
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => onAction({ op: "rebase", onto: branch.name })}>
                      Rebase current onto {branch.name}
                    </ContextMenuItem>
                  </>
                )}
                {isLive && (
                  <>
                    <ContextMenuSeparator />
                    <ContextMenuItem onClick={() => onRenameBranch(branch.name)}>
                      Rename branch…
                    </ContextMenuItem>
                    {!branch.current && (
                      <ContextMenuItem
                        variant="destructive"
                        onClick={() => onConfirmDeleteBranch(branch.name)}
                      >
                        Delete local branch
                      </ContextMenuItem>
                    )}
                  </>
                )}
              </ContextMenuContent>
            </ContextMenu>
          );
        })}
      </Section>

      {snapshot.pulls.length > 0 && (
        <Section title="Pull Requests" count={snapshot.pulls.length}>
          {snapshot.pulls.map((pr) => {
            const selected = inspector.kind === "pr" && inspector.number === pr.number;
            return (
              <Button
                key={pr.number}
                variant="ghost"
                size="xs"
                className={cn(
                  "h-auto w-full justify-start gap-1.5 px-2 py-1 text-left font-normal",
                  selected && "bg-accent text-accent-foreground",
                )}
                onClick={() => onSelectInspector({ kind: "pr", number: pr.number })}
              >
                <IconGitPullRequest className="size-3.5 shrink-0 text-primary" />
                <span className="shrink-0 font-mono text-[0.6875rem] text-muted-foreground">
                  #{pr.number}
                </span>
                <span className="min-w-0 flex-1 truncate">{pr.title}</span>
              </Button>
            );
          })}
        </Section>
      )}

      {snapshot.remotes.length > 0 && (
        <Section title="Remotes" count={snapshot.remotes.length} defaultOpen={false}>
          {snapshot.remotes.map((ref) => (
            <ContextMenu key={ref.fullName}>
              <ContextMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="xs"
                    className="h-auto w-full justify-start gap-1.5 px-2 py-1 font-normal"
                    onClick={() => onFilterBranch(ref.fullName)}
                  />
                }
              >
                <IconCloud className="size-3 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-left font-mono text-[0.75rem]">
                  {ref.fullName}
                </span>
              </ContextMenuTrigger>
              <ContextMenuContent>
                {isLive && (
                  <ContextMenuItem
                    onClick={() =>
                      onAction({ op: "checkout", ref: ref.fullName, createBranch: ref.name })
                    }
                  >
                    Checkout as {ref.name}
                  </ContextMenuItem>
                )}
                <ContextMenuItem onClick={() => onStartThreadFromRef(ref.fullName)}>
                  Start thread from {ref.fullName}
                </ContextMenuItem>
                {isLive && (
                  <>
                    <ContextMenuSeparator />
                    <ContextMenuItem
                      variant="destructive"
                      onClick={() => onConfirmDeleteBranch(ref.name, true)}
                    >
                      Delete remote branch
                    </ContextMenuItem>
                  </>
                )}
              </ContextMenuContent>
            </ContextMenu>
          ))}
        </Section>
      )}

      {snapshot.stashes.length > 0 && (
        <Section title="Stashes" count={snapshot.stashes.length} defaultOpen={false}>
          {snapshot.stashes.map((stash) => (
            <ContextMenu key={stash.ref}>
              <ContextMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="xs"
                    className="h-auto w-full justify-start gap-1.5 px-2 py-1 text-left font-normal"
                  />
                }
              >
                <IconArchive className="size-3 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{stash.message}</span>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem onClick={() => onAction({ op: "stash.pop", index: stash.index })}>
                  Pop stash
                </ContextMenuItem>
                <ContextMenuItem
                  onClick={() => onAction({ op: "stash.apply", index: stash.index })}
                >
                  Apply stash
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem
                  variant="destructive"
                  onClick={() => onAction({ op: "stash.drop", index: stash.index })}
                >
                  Drop stash
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          ))}
        </Section>
      )}

      {snapshot.tags.length > 0 && (
        <Section title="Tags" count={snapshot.tags.length} defaultOpen={false}>
          {snapshot.tags.slice(0, 50).map((tag) => (
            <ContextMenu key={tag.name}>
              <ContextMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="xs"
                    className="h-auto w-full justify-start gap-1.5 px-2 py-1 text-left font-normal"
                    onClick={() => onSelectInspector({ kind: "commit", sha: tag.sha })}
                  />
                }
              >
                <IconTag className="size-3 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate font-mono text-[0.75rem]">{tag.name}</span>
              </ContextMenuTrigger>
              <ContextMenuContent>
                {isLive && (
                  <ContextMenuItem onClick={() => onAction({ op: "checkout", ref: tag.name })}>
                    Checkout tag (detached)
                  </ContextMenuItem>
                )}
                <ContextMenuItem onClick={() => onStartThreadFromRef(tag.name)}>
                  Start thread from {tag.name}
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          ))}
        </Section>
      )}
    </aside>
  );
}
