import { expect, test } from "bun:test";

import {
  activeQuickView,
  commitFilterQuery,
  filtersOf,
  parseCenterSearch,
  pullsQuery,
  QUICK_VIEWS,
  quickViewSearch,
} from "./filters";

test("an address with values that are not known is read as the default view", () => {
  const search = parseCenterSearch({ state: "x", author: "ada", stale: "9999", sort: "random" });
  expect(filtersOf(search)).toEqual({
    state: "open",
    author: undefined,
    reviewRequested: undefined,
    review: undefined,
    checks: undefined,
    label: undefined,
    text: undefined,
    stale: undefined,
    sort: "updated",
  });
});

test("asks GitHub for what the filters say, `me` being the person's login", () => {
  const filters = filtersOf(
    parseCenterSearch({
      state: "draft",
      author: "me",
      checks: "failure",
      stale: "7",
      text: "login",
    }),
  );
  const query = new URLSearchParams(pullsQuery(filters, "ada")!);
  expect(Object.fromEntries(query)).toEqual({
    state: "open",
    page: "1",
    sort: "updated",
    draft: "true",
    author: "ada",
    checks: "failure",
    staleDays: "7",
    text: "login",
  });
});

test("waits for the login when a filter is the person's own", () => {
  expect(pullsQuery(filtersOf({ reviewRequested: "me" }), null)).toBeNull();
  expect(pullsQuery(filtersOf({ label: "bug" }), null)).toContain("label=bug");
});

test("a quick view is its filters alone, and shows as chosen only while they are all that is set", () => {
  const review = QUICK_VIEWS.find((view) => view.id === "review")!;
  const search = quickViewSearch(review, "p1");
  expect(search.project).toBe("p1");
  expect(activeQuickView(filtersOf(search))?.id).toBe("review");
  expect(activeQuickView(filtersOf({ ...search, label: "bug" }))).toBeUndefined();
  expect(activeQuickView(filtersOf({ ...search, state: "merged" }))).toBeUndefined();
  expect(activeQuickView(filtersOf({}))?.id).toBe("all");
});

test("asks for the commits the filters name, a file and a branch only for one project", () => {
  const search = parseCenterSearch({
    commitAuthor: "ada",
    since: "2026-11-01",
    until: "nonsense",
    path: "src/a.ts",
    branch: "feature/login",
  });
  expect(Object.fromEntries(new URLSearchParams(commitFilterQuery(search, true)))).toEqual({
    author: "ada",
    since: "2026-11-01",
    path: "src/a.ts",
    branch: "feature/login",
  });
  expect(Object.fromEntries(new URLSearchParams(commitFilterQuery(search, false)))).toEqual({
    author: "ada",
    since: "2026-11-01",
  });
});
