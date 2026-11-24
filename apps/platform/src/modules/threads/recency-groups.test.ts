import { describe, expect, test } from "bun:test";

import { recencyGroups } from "./recency-groups";
import type { Thread } from "./types";

const NOW = new Date(2026, 10, 14, 15, 0, 0);
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000).toISOString();

function thread(id: string, updatedAt: string, parentThreadId: string | null = null) {
  return { id, updatedAt, parentThreadId } as Thread;
}

const idsOf = (threads: Thread[]) =>
  recencyGroups(threads, NOW).map((group) => [group.label, group.threads.map((item) => item.id)]);

describe("recencyGroups", () => {
  test("splits threads into today, yesterday, last 7 days, last 30 days, and older", () => {
    expect(
      idsOf([
        thread("a", hoursAgo(1)),
        thread("y", hoursAgo(20)),
        thread("b", hoursAgo(24 * 3)),
        thread("c", hoursAgo(24 * 20)),
        thread("o", hoursAgo(24 * 45)),
        thread("d", hoursAgo(2)),
      ]),
    ).toEqual([
      ["Today", ["a", "d"]],
      ["Yesterday", ["y"]],
      ["Last 7 days", ["b"]],
      ["Last 30 days", ["c"]],
      ["Older", ["o"]],
    ]);
  });

  test("today starts at midnight, not 24 hours ago", () => {
    expect(idsOf([thread("late", hoursAgo(14)), thread("early", hoursAgo(16))])).toEqual([
      ["Today", ["late"]],
      ["Yesterday", ["early"]],
    ]);
  });

  test("omits empty groups", () => {
    expect(idsOf([thread("old", hoursAgo(24 * 15))])).toEqual([["Last 30 days", ["old"]]]);
    expect(idsOf([])).toEqual([]);
  });

  test("a thread older than 30 days lands in Older until it is archived", () => {
    expect(idsOf([thread("stale", hoursAgo(24 * 45))])).toEqual([["Older", ["stale"]]]);
  });

  test("a fork stays with its parent, in the group of whichever was touched last", () => {
    expect(
      idsOf([
        thread("fork", hoursAgo(1), "parent"),
        thread("parent", hoursAgo(24 * 10)),
        thread("other", hoursAgo(24 * 10)),
      ]),
    ).toEqual([
      ["Today", ["fork", "parent"]],
      ["Last 30 days", ["other"]],
    ]);
  });
});
