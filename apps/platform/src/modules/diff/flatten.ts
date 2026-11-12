import { splitRows } from "./parse-patch";
import type { DiffFile, DiffItem, DiffLayout } from "./types";

export const FOLD_ABOVE = 400;

export const startsOpen = (file: DiffFile) => file.additions + file.deletions <= FOLD_ABOVE;

export function flatten(
  files: DiffFile[],
  layout: DiffLayout,
  opened: Record<string, boolean>,
): DiffItem[] {
  const items: DiffItem[] = [];

  files.forEach((file, index) => {
    const open = opened[file.path] ?? startsOpen(file);
    items.push({ kind: "file", file, open, first: index === 0 });

    if (!open) return;

    if (file.hunks.length === 0) {
      items.push({ kind: "note", file });
      return;
    }

    file.hunks.forEach((hunk, at) => {
      items.push({ kind: "hunk", file, header: hunk.header });
      const lastHunk = at === file.hunks.length - 1;

      if (layout === "unified") {
        hunk.rows.forEach((row, place) =>
          items.push({
            kind: "unified",
            file,
            row,
            last: lastHunk && place === hunk.rows.length - 1,
          }),
        );
        return;
      }

      const pairs = splitRows(hunk.rows);
      pairs.forEach((pair, place) =>
        items.push({ kind: "split", file, pair, last: lastHunk && place === pairs.length - 1 }),
      );
    });
  });
  return items;
}

export const widestLine = (file: DiffFile) =>
  file.hunks.reduce(
    (widest, hunk) => hunk.rows.reduce((inner, row) => Math.max(inner, row.text.length), widest),
    0,
  );
