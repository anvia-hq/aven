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
  IconSearch,
  IconTag,
  IconX,
} from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { cn } from "cn";
import { useMemo, useState, type ReactNode } from "react";

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
import { Input } from "@aven/ui/input";
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
  forceOpen = false,
  children,
}: {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  forceOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const expanded = forceOpen || open;
  return (
    <div className="border-b border-border/50 py-1.5">
      <Button
        variant="ghost"
        size="xs"
        className="h-6 w-full justify-start gap-1 rounded-none px-2.5 text-[0.6875rem] font-medium text-muted-foreground hover:bg-transparent hover:text-foreground"
        onClick={() => setOpen((v) => !v)}
      >
        {expanded ? (
          <IconChevronDown className="size-3 shrink-0 opacity-70" />
        ) : (
          <IconChevronRight className="size-3 shrink-0 opacity-70" />
        )}
        <span className="flex-1 text-left">{title}</span>
        {count !== undefined && (
          <span className="font-mono text-[0.625rem] tabular-nums opacity-70">{count}</span>
        )}
      </Button>
      {expanded && <div className="mt-0.5 flex flex-col gap-0.5 px-1.5">{children}</div>}
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
  const [refQuery, setRefQuery] = useState("");
  const isLive = snapshot.mode === "live";
  const prByBranch = useMemo(
    () => new Map(snapshot.pulls.map((p) => [p.head, p])),
    [snapshot.pulls],
  );
  const baseDirty = wipTotalFiles(snapshot.wip);

  const normalizedQuery = refQuery.trim().toLowerCase();
  const filtering = normalizedQuery.length > 0;
  const totalRefs = snapshot.branches.length + snapshot.remotes.length + snapshot.tags.length;

  const filteredBranches = useMemo(
    () =>
      filtering
        ? snapshot.branches.filter((b) => b.name.toLowerCase().includes(normalizedQuery))
        : snapshot.branches,
    [filtering, normalizedQuery, snapshot.branches],
  );
  const filteredRemotes = useMemo(
    () =>
      filtering
        ? snapshot.remotes.filter((r) => r.fullName.toLowerCase().includes(normalizedQuery))
        : snapshot.remotes,
    [filtering, normalizedQuery, snapshot.remotes],
  );
  const filteredPulls = useMemo(
    () =>
      filtering
        ? snapshot.pulls.filter(
            (p) =>
              p.title.toLowerCase().includes(normalizedQuery) ||
              String(p.number).includes(normalizedQuery) ||
              p.head.toLowerCase().includes(normalizedQuery),
          )
        : snapshot.pulls,
    [filtering, normalizedQuery, snapshot.pulls],
  );
  const filteredTags = useMemo(
    () =>
      filtering
        ? snapshot.tags.filter((t) => t.name.toLowerCase().includes(normalizedQuery))
        : snapshot.tags,
    [filtering, normalizedQuery, snapshot.tags],
  );

  return (
    <aside className="flex h-full w-full min-w-0 flex-col bg-muted/15 text-xs">
      {totalRefs > 8 && (
        <div className="flex h-9 shrink-0 items-center border-b border-border/60 px-2">
          <div className="relative w-full">
            <IconSearch className="pointer-events-none absolute top-1/2 left-2 size-3 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={refQuery}
              onChange={(e) => setRefQuery(e.target.value)}
              placeholder="Filter refs…"
              className="h-7 pr-6 pl-6.5 text-xs"
            />
            {filtering && (
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Clear ref filter"
                className="absolute top-1/2 right-0.5 size-5 -translate-y-1/2 text-muted-foreground"
                onClick={() => setRefQuery("")}
              >
                <IconX className="size-3" />
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <Section title="Workspaces" count={1 + snapshot.threads.length}>
          <Button
            variant="ghost"
            size="xs"
            className={cn(
              "h-7 w-full justify-start gap-2 rounded-md px-2 text-left font-normal",
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
            <span className="min-w-0 flex-1 truncate text-left font-medium">Project Repo</span>
            {baseDirty > 0 && (
              <Badge
                variant="secondary"
                className="h-4 shrink-0 px-1.5 font-mono text-[0.625rem] tabular-nums"
              >
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
                  "group flex items-center gap-1 rounded-md pr-1 transition-colors",
                  active ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
                )}
              >
                <Button
                  variant="ghost"
                  size="xs"
                  className="h-auto min-w-0 flex-1 justify-start gap-2 px-2 py-1 text-left font-normal hover:bg-transparent"
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
                    <Badge
                      variant="secondary"
                      className="h-4 shrink-0 px-1.5 font-mono text-[0.625rem] tabular-nums"
                    >
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

        <Section
          title="Local Branches"
          count={filteredBranches.length}
          forceOpen={filtering && filteredBranches.length > 0}
        >
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
          {filteredBranches.map((branch) => {
            const pr = prByBranch.get(branch.name);
            const filtered = branchFilter === branch.name;
            return (
              <ContextMenu key={branch.name}>
                <ContextMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="xs"
                      title={branch.name}
                      className={cn(
                        "h-7 w-full justify-start gap-1.5 rounded-md px-2 text-left font-normal",
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
                      branch.current ? "text-primary" : "text-muted-foreground/80",
                    )}
                  />
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-left font-mono text-[0.75rem]",
                      branch.current ? "font-semibold text-foreground" : "text-foreground/85",
                    )}
                  >
                    {branch.name}
                  </span>
                  {(branch.ahead > 0 || branch.behind > 0) && (
                    <span className="shrink-0 font-mono text-[0.625rem] text-muted-foreground tabular-nums">
                      {branch.ahead > 0 ? `↑${branch.ahead}` : ""}
                      {branch.behind > 0 ? `↓${branch.behind}` : ""}
                    </span>
                  )}
                  {pr && (
                    <Badge
                      variant="outline"
                      className="h-4 shrink-0 px-1 font-mono text-[0.625rem] text-primary"
                    >
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
                      <ContextMenuItem
                        onClick={() => onAction({ op: "rebase", onto: branch.name })}
                      >
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

        {filteredPulls.length > 0 && (
          <Section
            title="Pull Requests"
            count={filteredPulls.length}
            forceOpen={filtering && filteredPulls.length > 0}
          >
            {filteredPulls.map((pr) => {
              const selected = inspector.kind === "pr" && inspector.number === pr.number;
              return (
                <Button
                  key={pr.number}
                  variant="ghost"
                  size="xs"
                  title={`#${pr.number} ${pr.title}`}
                  className={cn(
                    "h-7 w-full justify-start gap-1.5 rounded-md px-2 text-left font-normal",
                    selected && "bg-accent text-accent-foreground",
                  )}
                  onClick={() => onSelectInspector({ kind: "pr", number: pr.number })}
                >
                  <IconGitPullRequest className="size-3.5 shrink-0 text-success" />
                  <span className="shrink-0 font-mono text-[0.6875rem] text-muted-foreground tabular-nums">
                    #{pr.number}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-left">{pr.title}</span>
                </Button>
              );
            })}
          </Section>
        )}

        {filteredRemotes.length > 0 && (
          <Section
            title="Remotes"
            count={filteredRemotes.length}
            defaultOpen={false}
            forceOpen={filtering && filteredRemotes.length > 0}
          >
            {filteredRemotes.map((ref) => (
              <ContextMenu key={ref.fullName}>
                <ContextMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="xs"
                      title={ref.fullName}
                      className="h-7 w-full justify-start gap-1.5 rounded-md px-2 text-left font-normal"
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
                      title={stash.message}
                      className="h-7 w-full justify-start gap-1.5 rounded-md px-2 text-left font-normal"
                    />
                  }
                >
                  <IconArchive className="size-3 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-left">{stash.message}</span>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem
                    onClick={() => onAction({ op: "stash.pop", index: stash.index })}
                  >
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

        {filteredTags.length > 0 && (
          <Section
            title="Tags"
            count={filteredTags.length}
            defaultOpen={false}
            forceOpen={filtering && filteredTags.length > 0}
          >
            {filteredTags.slice(0, 50).map((tag) => (
              <ContextMenu key={tag.name}>
                <ContextMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="xs"
                      title={tag.name}
                      className="h-7 w-full justify-start gap-1.5 rounded-md px-2 text-left font-normal"
                      onClick={() => onSelectInspector({ kind: "commit", sha: tag.sha })}
                    />
                  }
                >
                  <IconTag className="size-3 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-left font-mono text-[0.75rem]">
                    {tag.name}
                  </span>
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
      </div>
    </aside>
  );
}
