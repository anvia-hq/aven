import {
  IconAlertTriangle,
  IconGitBranch,
  IconGitPullRequest,
  IconMessageCircle,
  IconSearch,
  IconTag,
  IconX,
} from "@tabler/icons-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "cn";
import { useRef } from "react";

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

const ROW_HEIGHT = 40;
const LANE_WIDTH = 15;
const MAX_LANES = 12;

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

const laneX = (lane: number) => lane * LANE_WIDTH + LANE_WIDTH / 2;
const MID = ROW_HEIGHT / 2;

function GraphSvg({
  row,
  lanes,
  dashed = false,
  isHead = false,
}: {
  row: GraphRow;
  lanes: number;
  dashed?: boolean;
  isHead?: boolean;
}) {
  const shown = Math.max(1, Math.min(lanes, MAX_LANES));
  const width = shown * LANE_WIDTH + 6;
  const line = "fill-none [stroke-linecap:round]";

  return (
    <svg
      aria-hidden
      width={width}
      height={ROW_HEIGHT}
      viewBox={`0 0 ${width} ${ROW_HEIGHT}`}
      className="shrink-0 overflow-hidden"
    >
      {row.through.map((lane) => (
        <path
          key={`t-${lane}`}
          d={`M ${laneX(lane)} 0 V ${ROW_HEIGHT}`}
          strokeWidth={2}
          className={`${line} ${STROKES[lane % STROKES.length]}`}
        />
      ))}
      {row.up.map((lane) => (
        <path
          key={`u-${lane}`}
          d={
            lane === row.lane
              ? `M ${laneX(lane)} 0 V ${MID}`
              : `M ${laneX(lane)} 0 Q ${laneX(lane)} ${MID} ${laneX(row.lane)} ${MID}`
          }
          strokeWidth={2}
          className={`${line} ${STROKES[lane % STROKES.length]}`}
        />
      ))}
      {row.down.map((lane) => (
        <path
          key={`d-${lane}`}
          d={
            lane === row.lane
              ? `M ${laneX(lane)} ${MID} V ${ROW_HEIGHT}`
              : `M ${laneX(row.lane)} ${MID} Q ${laneX(lane)} ${MID} ${laneX(lane)} ${ROW_HEIGHT}`
          }
          strokeWidth={2}
          strokeDasharray={dashed ? "3 3" : undefined}
          className={`${line} ${STROKES[lane % STROKES.length]}`}
        />
      ))}
      {dashed ? (
        <circle
          cx={laneX(row.lane)}
          cy={MID}
          r={4.5}
          strokeWidth={2}
          strokeDasharray="2 2"
          className={`fill-background ${STROKES[row.lane % STROKES.length]}`}
        />
      ) : (
        <circle
          cx={laneX(row.lane)}
          cy={MID}
          r={isHead ? 5 : 4}
          strokeWidth={2}
          className={`stroke-background ${FILLS[row.lane % FILLS.length]}`}
        />
      )}
    </svg>
  );
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
    <div className="flex min-w-0 flex-1 flex-col bg-background">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-2.5 py-1.5">
        <div className="relative min-w-44 flex-1">
          <IconSearch className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filters.search}
            onChange={(e) => onChangeFilters((prev) => ({ ...prev, search: e.target.value }))}
            placeholder="Search commits by message or SHA…"
            className="h-7 pl-7 text-xs"
          />
        </div>
        <Input
          value={filters.author}
          onChange={(e) => onChangeFilters((prev) => ({ ...prev, author: e.target.value }))}
          placeholder="Author"
          className="h-7 w-28 text-xs"
        />
        <Input
          value={filters.path}
          onChange={(e) => onChangeFilters((prev) => ({ ...prev, path: e.target.value }))}
          placeholder="File path"
          className="h-7 w-32 font-mono text-xs"
        />
        {filters.branch && (
          <Badge variant="secondary" className="gap-1 font-mono text-[0.6875rem]">
            <IconGitBranch className="size-3" />
            <span>{filters.branch}</span>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Clear branch filter"
              className="size-3.5 p-0"
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
                return (
                  <div key={row.id} style={style}>
                    <Button
                      variant="ghost"
                      className={cn(
                        "h-full w-full justify-start gap-2 rounded-none border-b border-border/40 px-2.5 text-left font-normal hover:bg-accent/50",
                        selected && "bg-accent text-accent-foreground",
                      )}
                      onClick={() => {
                        onSelectTarget(row.target);
                        onSelectInspector({ kind: "wip" });
                      }}
                    >
                      <GraphSvg row={row.graph} lanes={lanes} dashed />
                      <Badge
                        variant="outline"
                        className="shrink-0 gap-1 border-dashed text-[0.6875rem]"
                      >
                        {row.running ? <Spinner className="size-2.5" /> : null}
                        <span>WIP</span>
                      </Badge>
                      <span className="min-w-0 flex-1 truncate text-xs font-medium">
                        {row.label}
                        {row.branch ? ` (${row.branch})` : ""}
                      </span>
                      {row.conflicts && (
                        <Badge variant="destructive" className="shrink-0 gap-1 text-[0.625rem]">
                          <IconAlertTriangle className="size-3" />
                          <span>{row.conflicts.files.length} conflict(s)</span>
                        </Badge>
                      )}
                      <span className="shrink-0 font-mono text-[0.6875rem] text-muted-foreground">
                        {dirtyCount} file{dirtyCount === 1 ? "" : "s"}
                      </span>
                    </Button>
                  </div>
                );
              }

              const { commit } = row;
              const selected = inspector.kind === "commit" && inspector.sha === commit.sha;
              return (
                <div key={row.id} style={style}>
                  <ContextMenu>
                    <ContextMenuTrigger
                      render={
                        <Button
                          variant="ghost"
                          className={cn(
                            "h-full w-full justify-start gap-2 rounded-none border-b border-border/30 px-2.5 text-left font-normal hover:bg-accent/50",
                            selected && "bg-accent text-accent-foreground",
                          )}
                          onClick={() => onSelectInspector({ kind: "commit", sha: commit.sha })}
                        />
                      }
                    >
                      <GraphSvg row={row.graph} lanes={lanes} isHead={row.isHead} />
                      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
                        {commit.refs.slice(0, 2).map((ref) => (
                          <Badge
                            key={ref}
                            variant={row.isHead ? "default" : "secondary"}
                            className="h-5 shrink-0 gap-1 px-1.5 font-mono text-[0.625rem]"
                          >
                            <IconGitBranch className="size-2.5" />
                            <span>{ref}</span>
                          </Badge>
                        ))}
                        {commit.remoteRefs.slice(0, 1).map((ref) => (
                          <Badge
                            key={ref}
                            variant="outline"
                            className="h-5 shrink-0 px-1.5 font-mono text-[0.625rem] text-muted-foreground"
                          >
                            {ref}
                          </Badge>
                        ))}
                        {commit.tags.slice(0, 1).map((tag) => (
                          <Badge
                            key={tag}
                            variant="outline"
                            className="h-5 shrink-0 gap-0.5 px-1.5 font-mono text-[0.625rem]"
                          >
                            <IconTag className="size-2.5" />
                            <span>{tag}</span>
                          </Badge>
                        ))}
                        {row.threads.slice(0, 1).map((thread) => (
                          <Badge
                            key={thread.id}
                            variant="secondary"
                            className="h-5 shrink-0 gap-1 px-1.5 text-[0.625rem]"
                          >
                            {thread.running ? (
                              <Spinner className="size-2.5" />
                            ) : (
                              <IconMessageCircle className="size-2.5" />
                            )}
                            <span className="max-w-24 truncate">{thread.title}</span>
                          </Badge>
                        ))}
                        {row.pulls.slice(0, 1).map((pull) => (
                          <Badge
                            key={pull.number}
                            variant="outline"
                            className="h-5 shrink-0 gap-0.5 px-1.5 font-mono text-[0.625rem] text-primary"
                          >
                            <IconGitPullRequest className="size-2.5" />
                            <span>#{pull.number}</span>
                          </Badge>
                        ))}
                        <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                          {commit.message}
                        </span>
                      </div>
                      <span className="hidden shrink-0 font-mono text-[0.6875rem] text-muted-foreground 2xl:inline">
                        {commit.shortSha}
                      </span>
                      <span className="hidden w-24 shrink-0 truncate text-right text-[0.6875rem] text-muted-foreground 2xl:inline">
                        {commit.author ?? ""}
                      </span>
                      <span className="w-12 shrink-0 text-right text-[0.6875rem] text-muted-foreground">
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
