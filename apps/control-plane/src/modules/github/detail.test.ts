import { describe, expect, test } from "bun:test";

import { checksOf, latestReviews, shapeFiles } from "./detail";

describe("checksOf", () => {
  const run = (name: string, status: string, conclusion: string | null) => ({
    name,
    status,
    conclusion,
    html_url: null,
  });

  test("has none when there are none, or the app may not read them", () => {
    expect(checksOf(null)).toEqual({ state: "none", runs: [] });
    expect(checksOf([])).toEqual({ state: "none", runs: [] });
  });

  test("fails if any run failed, is pending while one has not finished, else passes", () => {
    expect(
      checksOf([run("a", "completed", "success"), run("b", "completed", "failure")]).state,
    ).toBe("failure");
    expect(checksOf([run("a", "completed", "success"), run("b", "in_progress", null)]).state).toBe(
      "pending",
    );
    expect(
      checksOf([run("a", "completed", "success"), run("b", "completed", "skipped")]).state,
    ).toBe("success");
    expect(checksOf([run("a", "completed", "timed_out"), run("b", "queued", null)]).state).toBe(
      "failure",
    );
  });
});

describe("latestReviews", () => {
  const review = (login: string | null, state: string) => ({
    user: login ? { login } : null,
    state,
  });

  test("keeps each reviewer's latest word, and a comment does not undo an approval", () => {
    expect(
      latestReviews([
        review("ada", "CHANGES_REQUESTED"),
        review("ada", "APPROVED"),
        review("ada", "COMMENTED"),
        review("grace", "COMMENTED"),
        review(null, "APPROVED"),
      ]),
    ).toEqual([
      { login: "ada", state: "approved" },
      { login: "grace", state: "commented" },
    ]);
  });
});

describe("shapeFiles", () => {
  test("lists the files with their patches cut, and a file with none has none", () => {
    const [big, binary] = shapeFiles([
      {
        filename: "a.ts",
        status: "modified",
        additions: 1,
        deletions: 0,
        patch: "x".repeat(50_000),
      },
      { filename: "b.png", status: "added", additions: 0, deletions: 0 },
    ]);
    expect(big!.patch).toHaveLength(40_000);
    expect(binary).toMatchObject({ path: "b.png", status: "added", patch: null, oldPath: null });
  });

  test("lists no more than a hundred", () => {
    const many = Array.from({ length: 150 }, (_, i) => ({
      filename: `f${i}`,
      status: "added",
      additions: 1,
      deletions: 0,
    }));
    expect(shapeFiles(many)).toHaveLength(100);
  });
});
