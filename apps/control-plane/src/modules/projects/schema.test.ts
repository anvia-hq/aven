import { describe, expect, test } from "bun:test";

import { commitsQuery, folderQuery, trackedQuery } from "./schema";

describe("folderQuery", () => {
  test.each(["", "src", "src/modules/app", "my docs/a b", ".github", "a.b/c..d"])(
    "accepts %p",
    (path) => {
      expect(folderQuery.safeParse({ path }).success).toBe(true);
    },
  );

  test("is the top of the repository without a path", () => {
    expect(folderQuery.parse({}).path).toBe("");
  });

  test.each(["..", ".", "src/..", "../..", "a//b", "/src", "src/", "a\0b", "x".repeat(1025)])(
    "refuses %p",
    (path) => {
      expect(folderQuery.safeParse({ path }).success).toBe(false);
    },
  );
});

describe("commitsQuery", () => {
  test("takes the history's filters, a day becoming the start of it", () => {
    expect(
      commitsQuery.parse({
        author: "ada",
        since: "2026-11-01",
        until: "2026-11-09",
        path: "src/a.ts",
        branch: "feature/login",
      }),
    ).toEqual({
      page: 1,
      author: "ada",
      since: "2026-11-01T00:00:00Z",
      until: "2026-11-09T00:00:00Z",
      path: "src/a.ts",
      branch: "feature/login",
    });
  });

  test.each([
    { since: "yesterday" },
    { path: "../etc/passwd" },
    { path: "a//b" },
    { branch: "a..b" },
    { branch: "x y" },
    { author: "a b" },
  ])("refuses %p", (query) => {
    expect(commitsQuery.safeParse(query).success).toBe(false);
  });
});

describe("trackedQuery", () => {
  test("is the first page of the open ones unless asked, and the query's page is a number", () => {
    expect(trackedQuery.parse({})).toEqual({ state: "open", page: 1 });
    expect(trackedQuery.parse({ state: "closed", page: "3" })).toEqual({
      state: "closed",
      page: 3,
    });
  });

  test.each([
    { state: "gone" },
    { author: "a b" },
    { staleDays: "0" },
    { page: "0" },
    { page: "101" },
    { page: "x" },
  ])("refuses %p", (query) => {
    expect(trackedQuery.safeParse(query).success).toBe(false);
  });

  test("takes the filters a pull request list can be narrowed by", () => {
    expect(
      trackedQuery.parse({
        state: "merged",
        author: "ada",
        reviewRequested: "grace",
        review: "approved",
        checks: "failure",
        label: "bug",
        draft: "false",
        staleDays: "7",
        text: "login",
        sort: "oldest",
      }),
    ).toEqual({
      state: "merged",
      page: 1,
      author: "ada",
      reviewRequested: "grace",
      review: "approved",
      checks: "failure",
      label: "bug",
      draft: false,
      staleDays: 7,
      text: "login",
      sort: "oldest",
    });
  });

  test("accepts the last page search gives", () => {
    expect(trackedQuery.safeParse({ page: "100" }).success).toBe(true);
  });
});

describe("commitsQuery", () => {
  test("is the first page unless a page is asked for, and the query's text is a number", () => {
    expect(commitsQuery.parse({})).toEqual({ page: 1 });
    expect(commitsQuery.parse({ page: "3" })).toEqual({ page: 3 });
  });

  test.each(["0", "-1", "1.5", "abc", "", "10001"])("refuses page %p", (page) => {
    expect(commitsQuery.safeParse({ page }).success).toBe(false);
  });
});
