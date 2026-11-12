import type { DiffFile } from "./types";

export function sameFile(a: DiffFile, b: DiffFile) {
  if (
    a.path !== b.path ||
    a.oldPath !== b.oldPath ||
    a.status !== b.status ||
    a.binary !== b.binary ||
    a.additions !== b.additions ||
    a.deletions !== b.deletions ||
    a.hunks.length !== b.hunks.length
  ) {
    return false;
  }

  return a.hunks.every((hunk, at) => {
    const other = b.hunks[at]!;
    return (
      hunk.header === other.header &&
      hunk.rows.length === other.rows.length &&
      hunk.rows.every((row, place) => {
        const next = other.rows[place]!;
        return row.kind === next.kind && row.text === next.text;
      })
    );
  });
}
