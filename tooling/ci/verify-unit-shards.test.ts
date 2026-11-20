import { describe, expect, test } from "bun:test";

import { verifyShards } from "./verify-unit-shards";

describe("verifyShards", () => {
  test("passes when shards partition all discovered files without gaps or duplicates", () => {
    const result = verifyShards(
      ["a.test.ts", "b.test.ts", "c.test.ts"],
      [
        { version: 1, files: { "a.test.ts": 120, "c.test.ts": 450 } },
        { version: 1, files: { "b.test.ts": 310 } },
      ],
    );

    expect(result.missing).toEqual([]);
    expect(result.duplicates).toEqual([]);
    expect(result.slowFiles).toEqual([]);
    expect(result.merged.files).toEqual({
      "a.test.ts": 120,
      "b.test.ts": 310,
      "c.test.ts": 450,
    });
  });

  test("reports missing, duplicate, and slow files", () => {
    const result = verifyShards(
      ["a.test.ts", "b.test.ts", "c.test.ts"],
      [
        { version: 1, files: { "a.test.ts": 25_000 } },
        { version: 1, files: { "a.test.ts": 24_000 } },
      ],
      20_000,
    );

    expect(result.missing).toEqual(["b.test.ts", "c.test.ts"]);
    expect(result.duplicates).toEqual(["a.test.ts"]);
    expect(result.slowFiles).toEqual([{ file: "a.test.ts", ms: 24_000 }]);
  });
});
