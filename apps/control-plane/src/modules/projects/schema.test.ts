import { describe, expect, test } from "bun:test";

import { commitsQuery, folderQuery, importProjectBody, trackedQuery } from "./schema";

const body = (repository: string) => ({
  installationId: crypto.randomUUID(),
  repository,
  runtimeId: crypto.randomUUID(),
});

describe("importProjectBody", () => {
  test("accepts owner/name", () => {
    expect(importProjectBody.safeParse(body("acme/web.app-2")).success).toBe(true);
  });

  test.each(["web", "acme/web/extra", "../..", "acme/..", "./web", "acme/web?x=1", "a b/c"])(
    "refuses %p",
    (repository) => {
      expect(importProjectBody.safeParse(body(repository)).success).toBe(false);
    },
  );
});

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

  // A dot-only or empty segment would climb out of `/repos/<owner>/<name>/contents/`.
  test.each(["..", ".", "src/..", "../..", "a//b", "/src", "src/", "a\0b", "x".repeat(1025)])(
    "refuses %p",
    (path) => {
      expect(folderQuery.safeParse({ path }).success).toBe(false);
    },
  );
});

describe("trackedQuery", () => {
  test("is the first page of the open ones unless asked, and the query's page is a number", () => {
    expect(trackedQuery.parse({})).toEqual({ state: "open", page: 1 });
    expect(trackedQuery.parse({ state: "closed", page: "3" })).toEqual({
      state: "closed",
      page: 3,
    });
  });

  // Search stops at a thousand matches: a hundred pages of ten.
  test.each([{ state: "all" }, { state: "merged" }, { page: "0" }, { page: "101" }, { page: "x" }])(
    "refuses %p",
    (query) => {
      expect(trackedQuery.safeParse(query).success).toBe(false);
    },
  );

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
