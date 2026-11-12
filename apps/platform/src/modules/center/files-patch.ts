import { parsePatch } from "@/modules/diff/parse-patch";
import type { DiffFile } from "@/modules/diff/types";

import type { FileChange } from "./types";

export function patchOf(files: FileChange[]): string {
  return files
    .map((file) => {
      const from = file.oldPath ?? file.path;
      const lines = [`diff --git a/${from} b/${file.path}`];

      if (file.status === "added") lines.push("new file mode 100644");

      if (file.status === "removed") lines.push("deleted file mode 100644");

      if (file.oldPath) lines.push(`rename from ${file.oldPath}`, `rename to ${file.path}`);

      if (file.patch) {
        lines.push(
          file.status === "added" ? "--- /dev/null" : `--- a/${from}`,
          file.status === "removed" ? "+++ /dev/null" : `+++ b/${file.path}`,
          file.patch,
        );
      } else if (file.additions + file.deletions === 0) {
        lines.push(`Binary files a/${from} and b/${file.path} differ`);
      }

      return lines.join("\n");
    })
    .join("\n");
}

export function diffFilesOf(files: FileChange[]): DiffFile[] {
  const parsed = parsePatch(patchOf(files));
  return parsed.map((file, index) => ({
    ...file,
    additions: files[index]?.additions ?? file.additions,
    deletions: files[index]?.deletions ?? file.deletions,
  }));
}
