import type { DiffFile, DiffHunk, DiffRow, SplitRow } from "./types";

const FILE_HEADER = /^diff --git a\/(.*) b\/(.*)$/;
const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

export function parsePatch(patch: string): DiffFile[] {
  const files: DiffFile[] = [];
  let file: DiffFile | undefined;
  let hunk: DiffHunk | undefined;
  let oldLeft = 0;
  let newLeft = 0;
  let oldNo = 0;
  let newNo = 0;

  for (const line of patch.split("\n")) {
    if (hunk && (oldLeft > 0 || newLeft > 0)) {
      const row = rowOf(line, oldNo, newNo);

      if (row) {
        hunk.rows.push(row);

        if (row.kind !== "add") {
          oldLeft--;
          oldNo++;
        }

        if (row.kind !== "del") {
          newLeft--;
          newNo++;
        }

        if (file && row.kind === "add") file.additions++;

        if (file && row.kind === "del") file.deletions++;

        continue;
      }

      if (line.startsWith("\\")) continue;
    }

    const header = FILE_HEADER.exec(line);

    if (header) {
      hunk = undefined;
      file = {
        path: header[2]!,
        status: "modified",
        binary: false,
        additions: 0,
        deletions: 0,
        hunks: [],
      };
      files.push(file);
      continue;
    }

    if (!file) continue;

    const opening = HUNK_HEADER.exec(line);

    if (opening) {
      oldNo = Number(opening[1]);
      newNo = Number(opening[3]);
      oldLeft = Number(opening[2] ?? 1);
      newLeft = Number(opening[4] ?? 1);
      hunk = { header: line, rows: [] };
      file.hunks.push(hunk);
    } else if (line.startsWith("new file mode")) file.status = "added";
    else if (line.startsWith("deleted file mode")) file.status = "deleted";
    else if (line.startsWith("rename from ")) {
      file.status = "renamed";
      file.oldPath = line.slice("rename from ".length);
    } else if (line.startsWith("rename to ")) file.path = line.slice("rename to ".length);
    else if (line.startsWith("Binary files ") || line.startsWith("GIT binary patch")) {
      file.binary = true;
    }
  }
  return files;
}

function rowOf(line: string, oldNo: number, newNo: number): DiffRow | null {
  const text = line.slice(1);
  switch (line[0]) {
    case "+":
      return { kind: "add", newNo, text };
    case "-":
      return { kind: "del", oldNo, text };
    case " ":
      return { kind: "ctx", oldNo, newNo, text };
    default:
      return line === "" ? { kind: "ctx", oldNo, newNo, text: "" } : null;
  }
}

export function splitRows(rows: DiffRow[]): SplitRow[] {
  const split: SplitRow[] = [];
  let removed: DiffRow[] = [];
  let added: DiffRow[] = [];
  const flush = () => {
    for (let at = 0; at < Math.max(removed.length, added.length); at++) {
      split.push({ old: removed[at], new: added[at] });
    }
    removed = [];
    added = [];
  };
  for (const row of rows) {
    if (row.kind === "del") {
      if (added.length > 0) flush();

      removed.push(row);
    } else if (row.kind === "add") added.push(row);
    else {
      flush();
      split.push({ old: row, new: row });
    }
  }
  flush();
  return split;
}
