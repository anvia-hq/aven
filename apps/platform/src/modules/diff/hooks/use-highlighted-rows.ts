import { useMemo } from "react";

import type { HighlightedLine } from "@/modules/files/highlight";
import { useHighlightedLines } from "@/modules/files/hooks/use-highlighted-lines";

import type { DiffHunk, DiffRow } from "../types";

function sides(hunks: DiffHunk[]) {
  const oldLines: string[] = [];
  const newLines: string[] = [];
  const at = new Map<DiffRow, { side: "old" | "new"; index: number }>();
  for (const hunk of hunks) {
    for (const row of hunk.rows) {
      if (row.kind === "del") {
        at.set(row, { side: "old", index: oldLines.length });
        oldLines.push(row.text);
        continue;
      }
      if (row.kind === "ctx") oldLines.push(row.text);
      at.set(row, { side: "new", index: newLines.length });
      newLines.push(row.text);
    }
  }
  return { oldText: oldLines.join("\n"), newText: newLines.join("\n"), at };
}

export function useHighlightedRows(
  hunks: DiffHunk[],
  path: string,
): (row: DiffRow) => HighlightedLine | null {
  const { oldText, newText, at } = useMemo(() => sides(hunks), [hunks]);
  const oldColoured = useHighlightedLines(oldText, path);
  const newColoured = useHighlightedLines(newText, path);
  return (row) => {
    const place = at.get(row);
    if (!place) return null;
    const coloured = place.side === "old" ? oldColoured : newColoured;
    return coloured?.[place.index] ?? null;
  };
}
