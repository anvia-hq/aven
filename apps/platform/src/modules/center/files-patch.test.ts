import { expect, test } from "bun:test";

import { diffFilesOf } from "./files-patch";
import type { FileChange } from "./types";

const file = (change: Partial<FileChange>): FileChange => ({
  path: "src/a.ts",
  oldPath: null,
  status: "modified",
  additions: 1,
  deletions: 1,
  patch: "@@ -1,2 +1,2 @@\n keep\n-old\n+new",
  ...change,
});

test("draws a file's patch as the diff reader does, with the counts GitHub gave", () => {
  const [parsed] = diffFilesOf([file({ additions: 5, deletions: 7 })]);
  expect(parsed).toMatchObject({
    path: "src/a.ts",
    status: "modified",
    additions: 5,
    deletions: 7,
  });
  expect(parsed!.hunks[0]!.rows.map((row) => row.kind)).toEqual(["ctx", "del", "add"]);
});

test("knows what happened to a file: added, removed, renamed, binary", () => {
  const files = diffFilesOf([
    file({ path: "new.ts", status: "added" }),
    file({ path: "gone.ts", status: "removed" }),
    file({ path: "b.ts", oldPath: "a.ts", status: "renamed" }),
    file({ path: "logo.png", status: "added", additions: 0, deletions: 0, patch: null }),
  ]);
  expect(files.map((item) => item.status)).toEqual(["added", "deleted", "renamed", "added"]);
  expect(files[2]).toMatchObject({ oldPath: "a.ts", path: "b.ts" });
  expect(files[3]!.binary).toBe(true);
});
