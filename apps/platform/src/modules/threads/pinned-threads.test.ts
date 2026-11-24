import { describe, expect, test } from "bun:test";

import { splitPinned, withoutPinned } from "./pinned-threads";
import { recencyGroups } from "./recency-groups";
import type { Thread } from "./types";

const NOW = new Date(2026, 10, 19, 15, 0, 0);
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000).toISOString();
const pinnedHoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000).toISOString();

function thread(
  id: string,
  options: { pinnedAt?: string | null; parentThreadId?: string | null; updatedAt?: string } = {},
) {
  return {
    id,
    pinnedAt: options.pinnedAt ?? null,
    parentThreadId: options.parentThreadId ?? null,
    updatedAt: options.updatedAt ?? hoursAgo(1),
  } as Thread;
}

describe("splitPinned", () => {
  test("keeps pinned families in pin order and leaves the rest in input order", () => {
    const threads = [
      thread("a", { pinnedAt: pinnedHoursAgo(1) }),
      thread("b"),
      thread("c", { pinnedAt: pinnedHoursAgo(3) }),
    ];
    const { pinned, pinnedIds } = splitPinned(threads);
    expect(pinned.map((item) => item.id)).toEqual(["a", "c"]);
    expect([...pinnedIds]).toEqual(["a", "c"]);
  });

  test("a pinned fork travels alone while its unpinned parent stays behind", () => {
    const parent = thread("parent", { updatedAt: hoursAgo(240) });
    const fork = thread("fork", { parentThreadId: "parent", pinnedAt: pinnedHoursAgo(2) });
    const { pinned, pinnedIds } = splitPinned([parent, fork]);
    expect(pinned.map((item) => item.id)).toEqual(["fork"]);
    expect([...pinnedIds]).toEqual(["fork"]);
  });

  test("pinning a parent brings its forks, root first, and a later fork pin raises the family", () => {
    const parent = thread("parent", { pinnedAt: pinnedHoursAgo(5) });
    const fork = thread("fork", { parentThreadId: "parent", pinnedAt: pinnedHoursAgo(1) });
    const other = thread("other", { pinnedAt: pinnedHoursAgo(3) });
    const { pinned } = splitPinned([parent, fork, other]);
    expect(pinned.map((item) => item.id)).toEqual(["parent", "fork", "other"]);
  });

  test("a thread whose parent is not in the list is its own root", () => {
    const orphan = thread("orphan", { parentThreadId: "gone", pinnedAt: pinnedHoursAgo(1) });
    expect(splitPinned([orphan]).pinned.map((item) => item.id)).toEqual(["orphan"]);
  });
});

describe("withoutPinned", () => {
  test("drops pinned rows but keeps the group their fork's activity gave the parent", () => {
    const parent = thread("parent", { updatedAt: hoursAgo(240) });
    const fork = thread("fork", { parentThreadId: "parent", updatedAt: hoursAgo(1) });
    const { pinnedIds } = splitPinned([{ ...fork, pinnedAt: pinnedHoursAgo(1) } as Thread, parent]);
    const groups = withoutPinned(recencyGroups([parent, fork], NOW), pinnedIds);
    expect(groups.map((group) => [group.label, group.threads.map((item) => item.id)])).toEqual([
      ["Today", ["parent"]],
    ]);
  });
});
