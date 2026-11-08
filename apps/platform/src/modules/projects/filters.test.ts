import { describe, expect, test } from "bun:test";

import { anyFilterSet, filterProjects, filtersOf, parseProjectsSearch } from "./filters";
import type { Project } from "./types";

function project(id: string, name: string, createdBy: string, runtimeId = "runner-1"): Project {
  return {
    id,
    name,
    repoFullName: `acme/${name}`,
    defaultBranch: "main",
    runtimeId,
    createdBy,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-02T00:00:00.000Z",
  };
}

const projects = [
  project("1", "shiny-app", "person-a"),
  project("2", "docs-site", "person-b", "runner-2"),
  project("3", "api-server", "person-a"),
];
const nobody = new Set<string>();
const context = { me: "person-a", running: nobody };

describe("parseProjectsSearch", () => {
  test("keeps the selection, the query and the filters", () => {
    expect(
      parseProjectsSearch({ project: "2", q: " docs ", view: "mine", runner: "runner-2" }),
    ).toEqual({ project: "2", q: "docs", view: "mine", runner: "runner-2" });
  });

  test("drops empty and unknown values", () => {
    expect(parseProjectsSearch({ project: "", q: "  ", view: "everything", runner: 7 })).toEqual({
      project: undefined,
      q: undefined,
      view: undefined,
      runner: undefined,
    });
  });

  test("writes All as no view, so the address stays clean", () => {
    expect(parseProjectsSearch({ view: "all" }).view).toBeUndefined();
    expect(filtersOf(parseProjectsSearch({})).view).toBe("all");
  });
});

describe("filterProjects", () => {
  test("lists every project by default", () => {
    expect(filterProjects(projects, filtersOf({}), context)).toHaveLength(3);
  });

  test("matches the name or the repository, in any case", () => {
    const docs = filterProjects(projects, filtersOf({ q: "DOCS" }), context);
    expect(docs.map((entry) => entry.name)).toEqual(["docs-site"]);

    const acme = filterProjects(projects, filtersOf({ q: "acme/shiny" }), context);
    expect(acme.map((entry) => entry.name)).toEqual(["shiny-app"]);
  });

  test("Mine keeps the projects the person imported", () => {
    const mine = filterProjects(projects, filtersOf({ view: "mine" }), context);
    expect(mine.map((entry) => entry.name)).toEqual(["shiny-app", "api-server"]);
  });

  test("Working keeps the projects with a running thread", () => {
    const working = filterProjects(projects, filtersOf({ view: "working" }), {
      ...context,
      running: new Set(["2"]),
    });
    expect(working.map((entry) => entry.name)).toEqual(["docs-site"]);
  });

  test("a runner narrows the list to the projects on it", () => {
    const onSecond = filterProjects(projects, filtersOf({ runner: "runner-2" }), context);
    expect(onSecond.map((entry) => entry.name)).toEqual(["docs-site"]);
  });

  test("the filters hold together", () => {
    const both = filterProjects(projects, filtersOf({ view: "mine", q: "api" }), context);
    expect(both.map((entry) => entry.name)).toEqual(["api-server"]);
    expect(filterProjects(projects, filtersOf({ view: "mine", q: "docs" }), context)).toEqual([]);
  });
});

describe("anyFilterSet", () => {
  test("is false only for the plain list", () => {
    expect(anyFilterSet(filtersOf({}))).toBe(false);
    expect(anyFilterSet(filtersOf({ q: "api" }))).toBe(true);
    expect(anyFilterSet(filtersOf({ view: "mine" }))).toBe(true);
    expect(anyFilterSet(filtersOf({ runner: "runner-2" }))).toBe(true);
  });
});
