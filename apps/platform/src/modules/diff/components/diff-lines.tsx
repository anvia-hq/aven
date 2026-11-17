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

export function UnifiedRow({
  row,
  colour,
  path,
  width,
  indicator,
}: {
  row: DiffRow;
  colour: Colour;
  path: string;
  width: number;
  indicator?: boolean;
}) {
  return (
    <div className={cn("flex", tint[row.kind])}>
      <Gutter number={row.oldNo} />
      <Gutter number={row.newNo} />
      <span className={cn("w-4 shrink-0 select-none text-center", ink[row.kind])}>
        {mark[row.kind]}
      </span>
      <span
        data-code={path}
        className={cn(
          "min-w-0 flex-1 overflow-x-auto whitespace-pre pr-3",
          indicator
            ? "[scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border"
            : "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        )}
      >
        <span className="block" style={{ minWidth: `${width}ch` }}>
          <Code row={row} colour={colour} />
        </span>
      </span>
    </div>
  );
}

export function Side({
  row,
  number,
  colour,
  path,
  width,
  indicator,
}: {
  row?: DiffRow;
  number?: number;
  colour: Colour;
  path: string;
  width: number;
  indicator?: boolean;
}) {
  return (
    <div className={cn("flex min-w-0", row && tint[row.kind], !row && "bg-muted/30")}>
      <Gutter number={number} />
      <span className="w-4 shrink-0 select-none text-center text-muted-foreground">
        {row && row.kind !== "ctx" ? mark[row.kind] : ""}
      </span>
      <span
        data-code={path}
        className={cn(
          "min-w-0 flex-1 overflow-x-auto whitespace-pre pr-2",
          indicator
            ? "[scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border"
            : "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        )}
      >
        <span className="block" style={{ minWidth: `${width}ch` }}>
          {row && <Code row={row} colour={colour} />}
        </span>
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
  const width = Math.max(0, ...hunks.flatMap((hunk) => hunk.rows.map((row) => row.text.length)));
  return (
    <div className="overflow-x-auto border-t font-mono text-xs leading-5">
      <div className={cn(layout === "unified" && "w-max min-w-full")}>
        {hunks.map((hunk, index) => {
          const pairs = splitRows(hunk.rows);
          const tail = index === hunks.length - 1;

          return (
            <div key={index}>
              <HunkHeader hunk={hunk} />
              {layout === "unified"
                ? hunk.rows.map((row, at) => (
                    <UnifiedRow
                      key={at}
                      row={row}
                      colour={colour}
                      path={path}
                      width={width}
                      indicator={tail && at === hunk.rows.length - 1}
                    />
                  ))
                : pairs.map((pair, at) => (
                    <div key={at} className="grid grid-cols-2 divide-x">
                      <Side
                        row={pair.old}
                        number={pair.old?.oldNo}
                        colour={colour}
                        path={path}
                        width={width}
                        indicator={tail && at === pairs.length - 1}
                      />
                      <Side
                        row={pair.new}
                        number={pair.new?.newNo}
                        colour={colour}
                        path={path}
                        width={width}
                        indicator={tail && at === pairs.length - 1}
                      />
                    </div>
                  ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
