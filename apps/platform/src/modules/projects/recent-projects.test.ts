import { describe, expect, test } from "bun:test";

import type { Thread } from "@/modules/threads/types";

import { recentProjects } from "./recent-projects";
import type { Project } from "./types";

const project = (id: string) => ({ id, name: id }) as Project;
const thread = (projectId: string, updatedAt: string) => ({ projectId, updatedAt }) as Thread;

describe("recentProjects", () => {
  test("keeps the five projects a thread touched last, newest first, and skips the rest", () => {
    const projects = ["a", "b", "c", "d", "e", "f", "quiet"].map(project);
    const threads = [
      thread("a", "2024-01-01T00:00:00.000Z"),
      thread("b", "2024-06-01T00:00:00.000Z"),
      thread("a", "2024-07-01T00:00:00.000Z"),
      thread("c", "2024-02-01T00:00:00.000Z"),
      thread("d", "2024-03-01T00:00:00.000Z"),
      thread("e", "2024-04-01T00:00:00.000Z"),
      thread("f", "2024-05-01T00:00:00.000Z"),
    ];

    expect(recentProjects(projects, threads).map((entry) => entry.id)).toEqual([
      "a",
      "b",
      "f",
      "e",
      "d",
    ]);
  });
});
