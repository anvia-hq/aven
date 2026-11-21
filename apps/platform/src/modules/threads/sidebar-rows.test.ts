import { describe, expect, test } from "bun:test";

import { buildSidebarRows } from "./sidebar-rows";
import type { Thread } from "./types";

function thread(id: string, parentThreadId: string | null = null): Thread {
  return {
    id,
    projectId: "p1",
    runtimeId: "r1",
    parentThreadId,
    title: id,
    state: "open",
    visibility: "private",
    drivingUntil: null,
    createdBy: "u1",
    createdByName: "Alice",
    createdByImage: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    pinnedAt: null,
    markColor: null,
    agentBackend: "native",
    modelProviderId: null,
    modelId: null,
    reasoningEffort: null,
    running: false,
    awaitingAnswer: false,
    participants: [],
    pullRequests: [],
  };
}

describe("buildSidebarRows", () => {
  test("groups split pairs once in their saved left-right order", () => {
    const a = thread("a");
    const b = thread("b");
    const c = thread("c");
    const partners = new Map([
      ["a", "b"],
      ["b", "a"],
    ]);
    const rows = buildSidebarRows([a, b, c], [["b", "a"]], (id) => partners.get(id));
    expect(rows).toEqual([
      { kind: "pair", pair: [b, a] },
      { kind: "thread", thread: c, nested: false, first: true, last: true },
    ]);
  });

  test("marks contiguous nested forks with first and last elbow flags", () => {
    const parent = thread("p");
    const f1 = thread("f1", "p");
    const f2 = thread("f2", "p");
    const rows = buildSidebarRows([parent, f1, f2], [], () => undefined);
    expect(rows).toEqual([
      { kind: "thread", thread: parent, nested: false, first: true, last: false },
      { kind: "thread", thread: f1, nested: true, first: true, last: false },
      { kind: "thread", thread: f2, nested: true, first: false, last: true },
    ]);
  });
});
