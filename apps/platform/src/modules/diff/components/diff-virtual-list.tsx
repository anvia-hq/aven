import { useVirtualizer } from "@tanstack/react-virtual";
import { IconChevronRight } from "@tabler/icons-react";
import { cn } from "cn";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type { UIEvent } from "react";

import { Badge } from "@aven/ui/badge";
import { Button } from "@aven/ui/button";

import { useFileColours } from "../hooks/use-file-colours";
import { widestLine } from "../flatten";
import type { DiffFile, DiffItem } from "../types";
import { HunkHeader, Side, UnifiedRow } from "./diff-lines";
import { DiffStat } from "./diff-stat";

const ROW = 20;
const PADDING = 16;

const statusLabel: Record<DiffFile["status"], string | null> = {
  added: "New",
  deleted: "Deleted",
  renamed: "Renamed",
  modified: null,
};

type Props = {
  items: DiffItem[];
  onToggle: (file: DiffFile, open: boolean) => void;
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
      <IconChevronRight
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

export function DiffVirtualList({ items, onToggle, footer }: Props) {
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
  const widths = useMemo(() => {
    const widest = new Map<string, number>();

    for (const item of items) {
      if (!widest.has(item.file.path)) widest.set(item.file.path, widestLine(item.file));
    }

    return widest;
  }, [items]);

  useEffect(() => {
    const node = scroller.current;

    if (!node) return;

    const pan = (event: WheelEvent) => {
      const code = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-code]");
      let step = event.deltaX;

      if (step === 0 && event.shiftKey) step = event.deltaY;

      if (!code || step === 0) return;

      const room = code.scrollWidth - code.clientWidth;

      if (room <= 0) return;

      event.preventDefault();
      code.scrollLeft = Math.max(0, Math.min(room, code.scrollLeft + step));
    };

    node.addEventListener("wheel", pan, { passive: false });

    return () => node.removeEventListener("wheel", pan);
  }, []);

  const offsets = useRef(new Map<string, number>());
  const written = useRef(new WeakMap<HTMLElement, number>());
  const placed = useRef(new WeakSet<HTMLElement>());

  const write = (node: HTMLElement, left: number) => {
    written.current.set(node, left);
    node.scrollLeft = left;
  };

  useLayoutEffect(() => {
    const canvas = scroller.current?.firstElementChild;

    if (!canvas) return;

    for (const node of canvas.querySelectorAll<HTMLElement>("[data-code]")) {
      if (placed.current.has(node)) continue;

      placed.current.add(node);

      const want = offsets.current.get(node.dataset.code ?? "") ?? 0;

      if (node.scrollLeft !== want) write(node, want);
    }
  });

  const mirrorCodeScroll = (event: UIEvent<HTMLDivElement>) => {
    const node = event.target as HTMLElement;
    const path = node.dataset.code;
    const canvas = event.currentTarget.firstElementChild;

    if (!path || !canvas) return;

    const echoed = written.current.get(node);

    written.current.delete(node);

    if (echoed === node.scrollLeft) return;

    offsets.current.set(path, node.scrollLeft);

    for (const peer of canvas.querySelectorAll<HTMLElement>(`[data-code="${CSS.escape(path)}"]`)) {
      if (peer === node || peer.scrollLeft === node.scrollLeft) continue;

      write(peer, node.scrollLeft);
    }
  };

  return (
    <div ref={scroller} className="min-h-0 flex-1 overflow-auto" onScrollCapture={mirrorCodeScroll}>
      <div
        className="relative font-mono text-xs leading-5"
        style={{ height: virtual.getTotalSize() }}
      >
        {rows.map((row) => {
          const item = items[row.index]!;
          const at = { transform: `translateY(${Math.round(row.start)}px)` };
          const colour = (target: Parameters<typeof colours>[1]) => colours(item.file, target);
          const belowHeader = items[row.index - 1]?.kind === "file";
          const width = widths.get(item.file.path) ?? 0;
          return (
            <div
              key={row.key}
              ref={virtual.measureElement}
              data-index={row.index}
              style={at}
              className="absolute top-0 left-0 w-full px-4"
            >
              {item.kind === "file" && (
                <div className={cn("w-full", !item.first && "pt-3")}>
                  <FileHeader item={item} onToggle={onToggle} />
                </div>
              )}
              {item.kind === "note" && (
                <p
                  className={cn(
                    "w-full border border-t-0 bg-card px-3 py-2 font-sans text-xs text-muted-foreground rounded-b-lg",
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
                <div
                  className={cn(
                    "border-x bg-card overflow-hidden",
                    item.last && "rounded-b-lg border-b",
                  )}
                >
                  <UnifiedRow
                    row={item.row}
                    colour={colour}
                    path={item.file.path}
                    width={width}
                    indicator={item.last}
                  />
                </div>
              )}
              {item.kind === "split" && (
                <div
                  className={cn(
                    "grid w-full grid-cols-2 divide-x border-x bg-card overflow-hidden",
                    item.last && "rounded-b-lg border-b",
                  )}
                >
                  <Side
                    row={item.pair.old}
                    number={item.pair.old?.oldNo}
                    colour={colour}
                    path={item.file.path}
                    width={width}
                    indicator={item.last}
                  />
                  <Side
                    row={item.pair.new}
                    number={item.pair.new?.newNo}
                    colour={colour}
                    path={item.file.path}
                    width={width}
                    indicator={item.last}
                  />
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
