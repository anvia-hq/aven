import { expect, test } from "bun:test";

import type { Thread } from "@/modules/threads/types";

import { projectActivity } from "./activity";
import type { Project } from "./types";

const project = (id: string, updatedAt: string) => ({ id, updatedAt }) as Project;

const thread = (id: string, projectId: string, updatedAt: string, extra: Partial<Thread> = {}) =>
  ({ id, projectId, updatedAt, state: "open", running: false, ...extra }) as Thread;

test("puts a working project first, then the one that changed last", () => {
  const entries = projectActivity(
    [project("quiet", "2026-01-09"), project("busy", "2026-01-01"), project("old", "2026-01-02")],
    [
      thread("a", "busy", "2026-01-03", { running: true }),
      thread("b", "old", "2026-01-10"),
      thread("c", "old", "2026-01-04"),
    ],
  );

  expect(entries.map((entry) => entry.project.id)).toEqual(["busy", "old", "quiet"]);
  expect(entries[0]!.working).toBe(1);
  expect(entries[1]!.threads.map((entry) => entry.id)).toEqual(["b", "c"]);
  expect(entries[1]!.lastActive).toBe("2026-01-10");
  expect(entries[2]!.lastActive).toBe("2026-01-09");
});

test("keeps archived threads on their own shelf", () => {
  const projects = [project("one", "2026-01-01")];
  const threads = [
    thread("kept", "one", "2026-01-02"),
    thread("snoozed", "one", "2026-01-03", { state: "snoozed" }),
    thread("away", "one", "2026-01-04", { state: "archived" }),
  ];

  expect(projectActivity(projects, threads)[0]!.threads.map((entry) => entry.id)).toEqual([
    "snoozed",
    "kept",
  ]);
  expect(
    projectActivity(projects, threads, "archived")[0]!.threads.map((entry) => entry.id),
  ).toEqual(["away"]);
});
