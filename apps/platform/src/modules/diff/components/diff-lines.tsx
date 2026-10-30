import { cn } from "cn";

import { splitRows } from "../parse-patch";
import type { DiffHunk, DiffLayout, DiffRow } from "../types";

const tint: Record<DiffRow["kind"], string> = {
  add: "bg-success/10",
  del: "bg-destructive/10",
  ctx: "",
};

const ink: Record<DiffRow["kind"], string> = {
  add: "text-success",
  del: "text-destructive",
  ctx: "text-muted-foreground",
};

const mark: Record<DiffRow["kind"], string> = { add: "+", del: "-", ctx: " " };

function Gutter({ number }: { number?: number }) {
  return (
    <span className="w-10 shrink-0 select-none px-1 text-right text-muted-foreground/60">
      {number}
    </span>
  );
}

function UnifiedRow({ row }: { row: DiffRow }) {
  return (
    <div className={cn("flex", tint[row.kind])}>
      <Gutter number={row.oldNo} />
      <Gutter number={row.newNo} />
      <span className={cn("w-4 shrink-0 select-none text-center", ink[row.kind])}>
        {mark[row.kind]}
      </span>
      <span className="whitespace-pre pr-3">{row.text}</span>
    </div>
  );
}

// One side of the split layout; an empty side has nothing to show.
function Side({ row, number }: { row?: DiffRow; number?: number }) {
  return (
    <div className={cn("flex min-w-0", row && tint[row.kind], !row && "bg-muted/30")}>
      <Gutter number={number} />
      <span className="w-4 shrink-0 select-none text-center text-muted-foreground">
        {row && row.kind !== "ctx" ? mark[row.kind] : ""}
      </span>
      <span className="min-w-0 whitespace-pre-wrap break-all pr-2">{row?.text}</span>
    </div>
  );
}

function HunkHeader({ hunk }: { hunk: DiffHunk }) {
  return (
    <div className="truncate bg-muted/50 px-3 py-0.5 text-muted-foreground">{hunk.header}</div>
  );
}

// A file's hunks. Unified keeps every line whole and scrolls sideways; split gives each side half
// the width and wraps what does not fit.
export function DiffLines({ hunks, layout }: { hunks: DiffHunk[]; layout: DiffLayout }) {
  return (
    <div className="overflow-x-auto border-t font-mono text-xs leading-5">
      <div className={cn(layout === "unified" && "w-max min-w-full")}>
        {hunks.map((hunk, index) => (
          <div key={index}>
            <HunkHeader hunk={hunk} />
            {layout === "unified"
              ? hunk.rows.map((row, at) => <UnifiedRow key={at} row={row} />)
              : splitRows(hunk.rows).map((pair, at) => (
                  <div key={at} className="grid grid-cols-2 divide-x">
                    <Side row={pair.old} number={pair.old?.oldNo} />
                    <Side row={pair.new} number={pair.new?.newNo} />
                  </div>
                ))}
          </div>
        ))}
      </div>
    </div>
  );
}
