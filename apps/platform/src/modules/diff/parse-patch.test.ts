import { describe, expect, test } from "bun:test";

import { parsePatch, splitRows } from "./parse-patch";

const MODIFIED = `diff --git a/src/a.ts b/src/a.ts
index 1111111..2222222 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,4 +1,4 @@ function a()
 one
-two
+three
 four
@@ -10 +10,2 @@
-ten
+ten!
+eleven
`;

describe("parsePatch", () => {
  test("reads hunks with line numbers and counts", () => {
    const [file, ...rest] = parsePatch(MODIFIED);
    expect(rest).toEqual([]);
    expect(file).toMatchObject({
      path: "src/a.ts",
      status: "modified",
      additions: 3,
      deletions: 2,
    });
    expect(file!.hunks).toHaveLength(2);
    expect(file!.hunks[0]!.rows).toEqual([
      { kind: "ctx", oldNo: 1, newNo: 1, text: "one" },
      { kind: "del", oldNo: 2, text: "two" },
      { kind: "add", newNo: 2, text: "three" },
      { kind: "ctx", oldNo: 3, newNo: 3, text: "four" },
    ]);
    expect(file!.hunks[1]!.rows[2]).toEqual({ kind: "add", newNo: 11, text: "eleven" });
  });

  test("tells added, deleted, renamed and binary files apart", () => {
    const files = parsePatch(`diff --git a/new.txt b/new.txt
new file mode 100644
index 0000000..e69de29
--- /dev/null
+++ b/new.txt
@@ -0,0 +1 @@
+hi
diff --git a/gone.txt b/gone.txt
deleted file mode 100644
index e69de29..0000000
--- a/gone.txt
+++ /dev/null
@@ -1 +0,0 @@
-bye
diff --git a/old.ts b/moved.ts
similarity index 100%
rename from old.ts
rename to moved.ts
diff --git a/logo.png b/logo.png
index 1..2 100644
Binary files a/logo.png and b/logo.png differ
`);
    expect(files.map((file) => [file.path, file.status, file.binary])).toEqual([
      ["new.txt", "added", false],
      ["gone.txt", "deleted", false],
      ["moved.ts", "renamed", false],
      ["logo.png", "modified", true],
    ]);
    expect(files[2]!.oldPath).toBe("old.ts");
  });

  test("a deleted line that looks like a header stays a line, and a missing newline is skipped", () => {
    const [file] = parsePatch(`diff --git a/x.sql b/x.sql
--- a/x.sql
+++ b/x.sql
@@ -1,2 +1,1 @@
--- comment
-drop
\\ No newline at end of file
+keep
\\ No newline at end of file
`);
    expect(file!.hunks[0]!.rows.map((row) => [row.kind, row.text])).toEqual([
      ["del", "-- comment"],
      ["del", "drop"],
      ["add", "keep"],
    ]);
  });

  test("a patch cut short still gives the files it has", () => {
    const [file] = parsePatch(MODIFIED.split("\n").slice(0, 8).join("\n"));
    expect(file!.hunks[0]!.rows.length).toBe(3);
  });

  test("an empty patch has no files", () => {
    expect(parsePatch("")).toEqual([]);
  });
});

describe("splitRows", () => {
  test("puts a changed line beside what it replaced", () => {
    const [file] = parsePatch(MODIFIED);
    const rows = splitRows(file!.hunks[0]!.rows);
    expect(rows.map((row) => [row.old?.text, row.new?.text])).toEqual([
      ["one", "one"],
      ["two", "three"],
      ["four", "four"],
    ]);
  });

  test("leaves a line without a partner alone on its side", () => {
    const [file] = parsePatch(MODIFIED);
    const rows = splitRows(file!.hunks[1]!.rows);
    expect(rows.map((row) => [row.old?.text, row.new?.text])).toEqual([
      ["ten", "ten!"],
      [undefined, "eleven"],
    ]);
  });
});
