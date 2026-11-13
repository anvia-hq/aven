import { describe, expect, test } from "bun:test";

import { flatten, widestLine } from "./flatten";
import { parsePatch } from "./parse-patch";

const patch = [
  "diff --git a/a.ts b/a.ts",
  "--- a/a.ts",
  "+++ b/a.ts",
  "@@ -1,2 +1,2 @@",
  " keep",
  "-old line is long",
  "+new",
  "diff --git a/b.bin b/b.bin",
  "Binary files a/b.bin and b/b.bin differ",
].join("\n");

describe("the diff panel's flat list", () => {
  const files = parsePatch(patch);

  test("a file is a header, then its hunk header and one item per row", () => {
    const items = flatten(files, "unified", {});
    expect(items.map((item) => item.kind)).toEqual([
      "file",
      "hunk",
      "unified",
      "unified",
      "unified",
      "file",
      "note",
    ]);
    expect(items.flatMap((item) => (item.kind === "unified" ? [item.last] : []))).toEqual([
      false,
      false,
      true,
    ]);
  });

  test("split pairs a removed line with the added one", () => {
    const rows = flatten(files, "split", {}).filter((item) => item.kind === "split");
    expect(rows).toHaveLength(2);
  });

  test("a closed file keeps only its header", () => {
    const items = flatten(files, "unified", { "a.ts": false });
    expect(items.map((item) => item.kind)).toEqual(["file", "file", "note"]);
  });

  test("the widest line is the longest text in the file", () => {
    expect(widestLine(files[0]!)).toBe("old line is long".length);
  });
});
