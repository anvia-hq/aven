import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronRight } from "@mynaui/icons-react";
import { cn } from "cn";
import { useMemo, useRef } from "react";

import { Badge } from "@aven/ui/badge";
import { Button } from "@aven/ui/button";

import { useFileColours } from "../hooks/use-file-colours";
import { widestLine } from "../flatten";
import type { DiffFile, DiffItem, DiffLayout } from "../types";
import { HunkHeader, Side, UnifiedRow } from "./diff-lines";
import { DiffStat } from "./diff-stat";

const ROW = 20;
const PADDING = 16;
const GUTTERS_REM = 6.5;

const statusLabel: Record<DiffFile["status"], string | null> = {
  added: "New",
  deleted: "Deleted",
  renamed: "Renamed",
  modified: null,
};

type Props = {
  items: DiffItem[];
  files: DiffFile[];
  onToggle: (file: DiffFile, open: boolean) => void;
  layout: DiffLayout;
  footer?: string;
};

function FileHeader({
  item,
  onToggle,
}: {
  item: Extract<DiffItem, { kind: "file" }>;
  onToggle: Props["onToggle"];
}) {
  const { file, open } = item;
  const label = statusLabel[file.status];
  return (
    <Button
      variant="ghost"
      aria-expanded={open}
      onClick={() => onToggle(file, !open)}
      className={cn(
        "h-auto w-full min-w-0 justify-start gap-2 border border-border bg-card px-3 py-2 text-left text-xs font-normal hover:bg-muted/50",
        open
          ? "rounded-t-lg rounded-b-none border-b-0 bg-muted aria-expanded:bg-muted"
          : "rounded-lg",
      )}
    >
      <ChevronRight
        className={cn(
          "size-3.5 shrink-0 text-muted-foreground transition-transform",
          open && "rotate-90",
        )}
      />
      <span className="min-w-0 flex-1 truncate font-mono" title={file.path}>
        {file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}
      </span>
      {label && <Badge variant="secondary">{label}</Badge>}
      <DiffStat additions={file.additions} deletions={file.deletions} hideZeros />
    </Button>
  );
}

export function DiffVirtualList({ items, files, layout, onToggle, footer }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const virtual = useVirtualizer({
    count: items.length,
    getScrollElement: () => scroller.current,
    estimateSize: (index) => (items[index]?.kind === "file" ? 40 : ROW),
    overscan: 20,
    paddingStart: PADDING,
    paddingEnd: PADDING,
    getItemKey: (index) => {
      const item = items[index]!;
      return `${item.file.path}:${index}`;
    },
  });
  const rows = virtual.getVirtualItems();
  const visibleFiles = useMemo(
    () => [...new Set(rows.map((row) => items[row.index]?.file))].filter((file) => !!file),
    [rows, items],
  );
  const colours = useFileColours(visibleFiles);
  const widest = useMemo(
    () => files.reduce((most, file) => Math.max(most, widestLine(file)), 0),
    [files],
  );

  return (
    <div ref={scroller} className="@container min-h-0 flex-1 overflow-auto">
      <div
        className="relative font-mono text-xs leading-5"
        style={{
          height: virtual.getTotalSize(),
          minWidth: layout === "unified" ? `calc(${widest}ch + ${GUTTERS_REM + 2}rem)` : undefined,
        }}
      >
        {rows.map((row) => {
          const item = items[row.index]!;
          const at = { transform: `translateY(${Math.round(row.start)}px)` };
          const colour = (target: Parameters<typeof colours>[1]) => colours(item.file, target);
          const belowHeader = items[row.index - 1]?.kind === "file";
          return (
            <div
              key={row.key}
              ref={virtual.measureElement}
              data-index={row.index}
              style={at}
              className="absolute top-0 left-0 w-full px-4"
            >
              {item.kind === "file" && (
                <div className={cn("w-[calc(100cqw-2rem)]", !item.first && "pt-3")}>
                  <FileHeader item={item} onToggle={onToggle} />
                </div>
              )}
              {item.kind === "note" && (
                <p
                  className={cn(
                    "w-[calc(100cqw-2rem)] border border-t-0 bg-card px-3 py-2 font-sans text-xs text-muted-foreground rounded-b-lg",
                    belowHeader && "-mt-px",
                  )}
                >
                  {item.file.binary
                    ? "Binary file changed."
                    : "Only the file's mode or name changed."}
                </p>
              )}
              {item.kind === "hunk" && (
                <div className={cn("border-x bg-card", belowHeader && "-mt-px")}>
                  <HunkHeader hunk={{ header: item.header, rows: [] }} />
                </div>
              )}
              {item.kind === "unified" && (
                <div className={cn("border-x bg-card", item.last && "rounded-b-lg border-b")}>
                  <UnifiedRow row={item.row} colour={colour} />
                </div>
              )}
              {item.kind === "split" && (
                <div
                  className={cn(
                    "grid w-[calc(100cqw-2rem)] grid-cols-2 divide-x border-x bg-card",
                    item.last && "rounded-b-lg border-b",
                  )}
                >
                  <Side row={item.pair.old} number={item.pair.old?.oldNo} colour={colour} />
                  <Side row={item.pair.new} number={item.pair.new?.newNo} colour={colour} />
                </div>
              )}
            </div>
          );
        })}
      </div>
      {footer && <p className="px-4 pb-4 text-center text-xs text-muted-foreground">{footer}</p>}
    </div>
  );
}
