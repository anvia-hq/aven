import {
  IconAlertTriangle,
  IconCloud,
  IconGitBranch,
  IconGitPullRequest,
  IconMessageCircle,
  IconSearch,
  IconTag,
  IconX,
} from "@tabler/icons-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "cn";
import { useRef, type KeyboardEvent } from "react";

import type { GitActionPayload, GraphRow } from "@aven/protocol/types";
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
import { shortTimeAgo } from "@/lib/format";

import { wipTotalFiles } from "../graph-rows";
import type {
  GitCenterFilters,
  GitCenterInspector,
  GitCenterTarget,
  GraphDisplayRow,
} from "../types";

const ROW_HEIGHT = 38;
const LANE_WIDTH = 16;
const MAX_LANES = 10;

const STROKES = [
  "stroke-graph-1",
  "stroke-graph-2",
  "stroke-graph-3",
  "stroke-graph-4",
  "stroke-graph-5",
  "stroke-graph-6",
];
const FILLS = [
  "fill-graph-1",
  "fill-graph-2",
  "fill-graph-3",
  "fill-graph-4",
  "fill-graph-5",
  "fill-graph-6",
];

const laneX = (lane: number) => lane * LANE_WIDTH + LANE_WIDTH / 2 + 2;
const MID = ROW_HEIGHT / 2;

function GraphSvg({
  row,
  lanes,
  dashed = false,
  isHead = false,
  isMerge = false,
}: {
  row: GraphRow;
  lanes: number;
  dashed?: boolean;
  isHead?: boolean;
  isMerge?: boolean;
}) {
  const shown = Math.max(1, Math.min(lanes, MAX_LANES));
  const width = shown * LANE_WIDTH + 6;
  const line = "fill-none [stroke-linecap:round]";
  const colorIdx = row.lane % STROKES.length;
  const cx = laneX(row.lane);

  return (
    <svg
      aria-hidden
      width={width}
      height={ROW_HEIGHT}
      viewBox={`0 0 ${width} ${ROW_HEIGHT}`}
      className="size-auto shrink-0 overflow-visible"
    >
      {row.through.map((lane) => (
        <path
          key={`t-${lane}`}
          d={`M ${laneX(lane)} 0 V ${ROW_HEIGHT}`}
          strokeWidth={2}
          className={`${line} ${STROKES[lane % STROKES.length]}`}
        />
      ))}
      {row.up.map((lane) => {
        const fromX = laneX(lane);
        const d =
          lane === row.lane
            ? `M ${fromX} 0 V ${MID}`
            : `M ${fromX} 0 C ${fromX} ${MID * 0.85}, ${cx} ${MID * 0.15}, ${cx} ${MID}`;
        return (
          <path
            key={`u-${lane}`}
            d={d}
            strokeWidth={2}
            className={`${line} ${STROKES[lane % STROKES.length]}`}
          />
        );
      })}
      {row.down.map((lane) => {
        const toX = laneX(lane);
        const d =
          lane === row.lane
            ? `M ${toX} ${MID} V ${ROW_HEIGHT}`
            : `M ${cx} ${MID} C ${cx} ${MID + MID * 0.85}, ${toX} ${MID + MID * 0.15}, ${toX} ${ROW_HEIGHT}`;
        return (
          <path
            key={`d-${lane}`}
            d={d}
            strokeWidth={2}
            strokeDasharray={dashed ? "3 3" : undefined}
            className={`${line} ${STROKES[lane % STROKES.length]}`}
          />
        );
      })}
      {dashed && (
        <circle
          cx={cx}
          cy={MID}
          r={4.5}
          strokeWidth={2}
          strokeDasharray="2.5 2"
          className={`fill-background ${STROKES[colorIdx]}`}
        />
      )}
      {!dashed && isHead && (
        <>
          <circle
            cx={cx}
            cy={MID}
            r={7.5}
            strokeWidth={1.5}
            strokeOpacity={0.35}
            className={`fill-none ${STROKES[colorIdx]}`}
          />
          <circle
            cx={cx}
            cy={MID}
            r={4.5}
            strokeWidth={1.5}
            className={`stroke-background ${FILLS[colorIdx]}`}
          />
        </>
      )}
      {!dashed && !isHead && isMerge && (
        <circle
          cx={cx}
          cy={MID}
          r={4}
          strokeWidth={2.25}
          className={`fill-background ${STROKES[colorIdx]}`}
        />
      )}
      {!dashed && !isHead && !isMerge && (
        <circle
          cx={cx}
          cy={MID}
          r={4}
          strokeWidth={1.5}
          className={`stroke-background ${FILLS[colorIdx]}`}
        />
      )}
    </svg>
  );
}

function splitRefs(localRefs: string[], remoteRefs: string[]) {
  const remoteSet = new Set(remoteRefs);
  const consumedRemotes = new Set<string>();

  const pairedLocals = localRefs.map((name) => {
    const originName = `origin/${name}`;
    const hasOrigin = remoteSet.has(originName);

    if (hasOrigin) consumedRemotes.add(originName);

    return { name, hasOrigin };
  });

  const standaloneRemotes = remoteRefs.filter((r) => !consumedRemotes.has(r));
  return { pairedLocals, standaloneRemotes };
}

function handleRowKeyDown(event: KeyboardEvent<HTMLDivElement>, activate: () => void) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    activate();
  }
}

type Props = {
  rows: GraphDisplayRow[];
  lanes: number;
  isLive: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  filters: GitCenterFilters;
  inspector: GitCenterInspector;
  target: GitCenterTarget;
  onChangeFilters: (updater: (prev: GitCenterFilters) => GitCenterFilters) => void;
  onSelectTarget: (target: GitCenterTarget) => void;
  onSelectInspector: (inspector: GitCenterInspector) => void;
  onLoadMore: () => void;
  onAction: (action: GitActionPayload) => void;
  onConfirmReset: (sha: string, mode: "soft" | "mixed" | "hard") => void;
  onCreateBranchFrom: (sha: string) => void;
  onStartThreadFromRef: (ref: string) => void;
};

export function GitGraphPane({
  rows,
  lanes,
  isLive,
  hasMore,
  loadingMore,
  filters,
  inspector,
  target,
  onChangeFilters,
  onSelectTarget,
  onSelectInspector,
  onLoadMore,
  onAction,
  onConfirmReset,
  onCreateBranchFrom,
  onStartThreadFromRef,
}: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const virtual = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 20,
    getItemKey: (index) => rows[index]!.id,
  });

  const hasFilters = Boolean(filters.search || filters.branch || filters.author || filters.path);

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col bg-background">
      <div className="flex min-h-9 shrink-0 flex-wrap items-center gap-1.5 border-b border-border/60 bg-muted/15 px-2.5 py-1">
        <div className="relative min-w-36 flex-1">
          <IconSearch className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filters.search}
            onChange={(e) => onChangeFilters((prev) => ({ ...prev, search: e.target.value }))}
            placeholder="Search commits by message or SHA…"
            className="h-6.5 pl-7 text-xs"
          />
        </div>
        <Input
          value={filters.author}
          onChange={(e) => onChangeFilters((prev) => ({ ...prev, author: e.target.value }))}
          placeholder="Author"
          className="h-6.5 w-24 text-xs xl:w-28"
        />
        <Input
          value={filters.path}
          onChange={(e) => onChangeFilters((prev) => ({ ...prev, path: e.target.value }))}
          placeholder="File path"
          className="h-6.5 w-28 font-mono text-xs xl:w-32"
        />
        {filters.branch && (
          <Badge
            variant="secondary"
            className="h-6 max-w-44 gap-1 px-1.5 font-mono text-[0.6875rem]"
          >
            <IconGitBranch className="size-3 shrink-0" />
            <span className="truncate">{filters.branch}</span>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Clear branch filter"
              className="size-3.5 shrink-0 p-0"
              onClick={() => onChangeFilters((prev) => ({ ...prev, branch: null }))}
            >
              <IconX className="size-2.5" />
            </Button>
          </Badge>
        )}
        {hasFilters && (
          <Button
            variant="ghost"
            size="xs"
            className="h-6.5 px-2 text-xs text-muted-foreground"
            onClick={() =>
              onChangeFilters(() => ({ search: "", branch: null, author: "", path: "" }))
            }
          >
            Reset
          </Button>
        )}
      </div>

      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <div className="flex h-48 items-center justify-center text-xs text-muted-foreground">
            No commits match the current filters.
          </div>
        ) : (
          <div style={{ height: `${virtual.getTotalSize()}px` }} className="relative w-full">
            {virtual.getVirtualItems().map((vRow) => {
              const row = rows[vRow.index]!;
              const style = {
                position: "absolute" as const,
                top: 0,
                left: 0,
                width: "100%",
                height: `${ROW_HEIGHT}px`,
                transform: `translateY(${vRow.start}px)`,
              };

              if (row.kind === "wip") {
                const selected =
                  inspector.kind === "wip" &&
                  ((row.target.kind === "project" && target.kind === "project") ||
                    (row.target.kind === "thread" &&
                      target.kind === "thread" &&
                      row.target.threadId === target.threadId));
                const dirtyCount = wipTotalFiles(row.wip);
                const activateWip = () => {
                  onSelectTarget(row.target);
                  onSelectInspector({ kind: "wip" });
                };
                return (
                  <div key={row.id} style={style}>
                    <div
                      role="button"
                      tabIndex={0}
                      className={cn(
                        "flex h-full w-full cursor-pointer items-center gap-2.5 px-2.5 text-left transition-colors outline-none hover:bg-accent/45 focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset",
                        selected && "bg-accent/70 shadow-[inset_2px_0_0_0_var(--primary)]",
                      )}
                      onClick={activateWip}
                      onKeyDown={(e) => handleRowKeyDown(e, activateWip)}
                    >
                      <GraphSvg row={row.graph} lanes={lanes} dashed />
                      <Badge
                        variant="outline"
                        className="h-5 shrink-0 gap-1 border-dashed px-1.5 text-[0.625rem] font-medium"
                      >
                        {row.running ? <Spinner className="size-2.5" /> : null}
                        <span>WIP</span>
                      </Badge>
                      <span className="min-w-0 flex-1 truncate text-[0.8125rem] font-medium text-foreground">
                        {row.label}
                        {row.branch ? ` (${row.branch})` : ""}
                      </span>
                      {row.conflicts && (
                        <Badge
                          variant="destructive"
                          className="h-5 shrink-0 gap-1 px-1.5 text-[0.625rem]"
                        >
                          <IconAlertTriangle className="size-3" />
                          <span>{row.conflicts.files.length} conflict(s)</span>
                        </Badge>
                      )}
                      <span className="shrink-0 font-mono text-[0.6875rem] text-muted-foreground tabular-nums">
                        {dirtyCount} file{dirtyCount === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>
                );
              }

              const { commit } = row;
              const selected = inspector.kind === "commit" && inspector.sha === commit.sha;
              const isMerge = commit.parents.length > 1;
              const { pairedLocals, standaloneRemotes } = splitRefs(commit.refs, commit.remoteRefs);
              const hasBadges =
                pairedLocals.length > 0 ||
                standaloneRemotes.length > 0 ||
                commit.tags.length > 0 ||
                row.threads.length > 0 ||
                row.pulls.length > 0;
              const activateCommit = () => onSelectInspector({ kind: "commit", sha: commit.sha });

              return (
                <div key={row.id} style={style}>
                  <ContextMenu>
                    <ContextMenuTrigger
                      render={
                        <div
                          role="button"
                          tabIndex={0}
                          className={cn(
                            "flex h-full w-full cursor-pointer items-center gap-2.5 px-2.5 text-left transition-colors outline-none hover:bg-accent/45 focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset",
                            selected && "bg-accent/70 shadow-[inset_2px_0_0_0_var(--primary)]",
                          )}
                          onClick={activateCommit}
                          onKeyDown={(e) => handleRowKeyDown(e, activateCommit)}
                        />
                      }
                    >
                      <GraphSvg
                        row={row.graph}
                        lanes={lanes}
                        isHead={row.isHead}
                        isMerge={isMerge}
                      />
                      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
                        {pairedLocals.slice(0, 2).map(({ name, hasOrigin }) => (
                          <Badge
                            key={name}
                            title={hasOrigin ? `${name} (synced with origin/${name})` : name}
                            variant={row.isHead ? "default" : "secondary"}
                            className="h-5 max-w-44 shrink-0 gap-1 px-1.5 font-mono text-[0.625rem]"
                          >
                            <IconGitBranch className="size-2.5 shrink-0" />
                            {hasOrigin && <IconCloud className="size-2.5 shrink-0 opacity-75" />}
                            <span className="truncate">{name}</span>
                          </Badge>
                        ))}
                        {standaloneRemotes.slice(0, 1).map((ref) => (
                          <Badge
                            key={ref}
                            title={ref}
                            variant="outline"
                            className="h-5 max-w-40 shrink-0 gap-1 px-1.5 font-mono text-[0.625rem] text-muted-foreground"
                          >
                            <IconCloud className="size-2.5 shrink-0 opacity-70" />
                            <span className="truncate">{ref}</span>
                          </Badge>
                        ))}
                        {commit.tags.slice(0, 1).map((tag) => (
                          <Badge
                            key={tag}
                            title={tag}
                            variant="outline"
                            className="h-5 max-w-32 shrink-0 gap-0.5 px-1.5 font-mono text-[0.625rem]"
                          >
                            <IconTag className="size-2.5 shrink-0" />
                            <span className="truncate">{tag}</span>
                          </Badge>
                        ))}
                        {row.threads.slice(0, 1).map((thread) => (
                          <Badge
                            key={thread.id}
                            title={thread.title}
                            variant="secondary"
                            className="h-5 max-w-32 shrink-0 gap-1 px-1.5 text-[0.625rem] text-info"
                          >
                            {thread.running ? (
                              <Spinner className="size-2.5 shrink-0" />
                            ) : (
                              <IconMessageCircle className="size-2.5 shrink-0" />
                            )}
                            <span className="truncate">{thread.title}</span>
                          </Badge>
                        ))}
                        {row.pulls.slice(0, 1).map((pull) => (
                          <Badge
                            key={pull.number}
                            title={`#${pull.number} ${pull.title}`}
                            variant="outline"
                            className="h-5 shrink-0 gap-0.5 px-1.5 font-mono text-[0.625rem] text-success"
                          >
                            <IconGitPullRequest className="size-2.5 shrink-0" />
                            <span>#{pull.number}</span>
                          </Badge>
                        ))}
                        <span
                          title={commit.message}
                          className={cn(
                            "min-w-0 flex-1 truncate text-[0.8125rem]",
                            isMerge ? "text-muted-foreground" : "text-foreground",
                            (selected || hasBadges) && !isMerge && "font-medium",
                          )}
                        >
                          {commit.message}
                        </span>
                      </div>
                      <span className="hidden w-14 shrink-0 text-right font-mono text-[0.6875rem] text-muted-foreground/80 lg:inline">
                        {commit.shortSha}
                      </span>
                      <span className="hidden w-28 shrink-0 truncate text-right text-[0.6875rem] text-muted-foreground 2xl:inline">
                        {commit.author ?? ""}
                      </span>
                      <span className="w-9 shrink-0 text-right font-mono text-[0.6875rem] text-muted-foreground/80 tabular-nums">
                        {commit.date ? shortTimeAgo(commit.date) : ""}
                      </span>
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                      <ContextMenuItem onClick={() => onStartThreadFromRef(commit.sha)}>
                        Start thread from {commit.shortSha}
                      </ContextMenuItem>
                      {isLive && (
                        <>
                          <ContextMenuItem onClick={() => onCreateBranchFrom(commit.sha)}>
                            Create branch here…
                          </ContextMenuItem>
                          <ContextMenuItem
                            onClick={() => onAction({ op: "checkout", ref: commit.sha })}
                          >
                            Checkout commit (detached)
                          </ContextMenuItem>
                          <ContextMenuSeparator />
                          <ContextMenuItem
                            onClick={() => onAction({ op: "cherryPick", sha: commit.sha })}
                          >
                            Cherry-pick commit
                          </ContextMenuItem>
                          <ContextMenuItem
                            onClick={() => onAction({ op: "revert", sha: commit.sha })}
                          >
                            Revert commit
                          </ContextMenuItem>
                          <ContextMenuSeparator />
                          <ContextMenuItem onClick={() => onConfirmReset(commit.sha, "soft")}>
                            Reset current branch here (soft)
                          </ContextMenuItem>
                          <ContextMenuItem onClick={() => onConfirmReset(commit.sha, "mixed")}>
                            Reset current branch here (mixed)
                          </ContextMenuItem>
                          <ContextMenuItem
                            variant="destructive"
                            onClick={() => onConfirmReset(commit.sha, "hard")}
                          >
                            Reset current branch here (hard)
                          </ContextMenuItem>
                        </>
                      )}
                      <ContextMenuSeparator />
                      <ContextMenuItem
                        onClick={() => void navigator.clipboard.writeText(commit.sha)}
                      >
                        Copy full SHA
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                </div>
              );
            })}
          </div>
        )}

        {hasMore && (
          <div className="flex justify-center p-3">
            <Button variant="outline" size="xs" disabled={loadingMore} onClick={onLoadMore}>
              {loadingMore ? "Loading…" : "Load older commits"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
