import { cn } from "cn";

import { useHighlightedRows } from "../hooks/use-highlighted-rows";
import { splitRows } from "../parse-patch";
import type { DiffHunk, DiffLayout, DiffRow } from "../types";
import type { HighlightedLine } from "@/modules/files/types";

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

type Colour = (row: DiffRow) => HighlightedLine | null;

function Code({ row, colour }: { row: DiffRow; colour: Colour }) {
  const tokens = colour(row);

  if (!tokens) return row.text;

  return tokens.map((token, at) => (
    <span
      key={at}
      style={token.htmlStyle}
      className="text-(--shiki-light) dark:text-(--shiki-dark)"
    >
      {token.content}
    </span>
  ));
}

function Gutter({ number }: { number?: number }) {
  return (
    <span className="w-10 shrink-0 select-none px-1 text-right text-muted-foreground/60">
      {number}
    </span>
  );
}

export function UnifiedRow({ row, colour }: { row: DiffRow; colour: Colour }) {
  return (
    <div className={cn("flex", tint[row.kind])}>
      <Gutter number={row.oldNo} />
      <Gutter number={row.newNo} />
      <span className={cn("w-4 shrink-0 select-none text-center", ink[row.kind])}>
        {mark[row.kind]}
      </span>
      <span className="whitespace-pre pr-3">
        <Code row={row} colour={colour} />
      </span>
    </div>
  );
}

export function Side({ row, number, colour }: { row?: DiffRow; number?: number; colour: Colour }) {
  return (
    <div className={cn("flex min-w-0", row && tint[row.kind], !row && "bg-muted/30")}>
      <Gutter number={number} />
      <span className="w-4 shrink-0 select-none text-center text-muted-foreground">
        {row && row.kind !== "ctx" ? mark[row.kind] : ""}
      </span>
      <span className="min-w-0 whitespace-pre-wrap break-all pr-2">
        {row && <Code row={row} colour={colour} />}
      </span>
    </div>
  );
}

export function HunkHeader({ hunk }: { hunk: DiffHunk }) {
  return (
    <div className="truncate bg-muted/50 px-3 py-0.5 text-muted-foreground">{hunk.header}</div>
  );
}

export function DiffLines({
  hunks,
  path,
  layout,
}: {
  hunks: DiffHunk[];
  path: string;
  layout: DiffLayout;
}) {
  const colour = useHighlightedRows(hunks, path);
  return (
    <div className="overflow-x-auto border-t font-mono text-xs leading-5">
      <div className={cn(layout === "unified" && "w-max min-w-full")}>
        {hunks.map((hunk, index) => (
          <div key={index}>
            <HunkHeader hunk={hunk} />
            {layout === "unified"
              ? hunk.rows.map((row, at) => <UnifiedRow key={at} row={row} colour={colour} />)
              : splitRows(hunk.rows).map((pair, at) => (
                  <div key={at} className="grid grid-cols-2 divide-x">
                    <Side row={pair.old} number={pair.old?.oldNo} colour={colour} />
                    <Side row={pair.new} number={pair.new?.newNo} colour={colour} />
                  </div>
                ))}
          </div>
        ))}
      </div>
    </div>
  );
}
