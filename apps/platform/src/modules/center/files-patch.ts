import { parsePatch } from "@/modules/diff/parse-patch";
import type { DiffFile } from "@/modules/diff/types";

import type { FileChange } from "./types";

// GitHub gives each file's patch from its first hunk on; the diff reader wants what `git diff`
// prints, so each file gets the header lines that say its name and what happened to it.
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

// The files as the diff reader draws them, the counts being GitHub's own, which stay right when a
// patch was too large to be listed.
export function diffFilesOf(files: FileChange[]): DiffFile[] {
  const parsed = parsePatch(patchOf(files));
  return parsed.map((file, index) => ({
    ...file,
    additions: files[index]?.additions ?? file.additions,
    deletions: files[index]?.deletions ?? file.deletions,
  }));
}
