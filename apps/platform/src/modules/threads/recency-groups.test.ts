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

const EMPTY = ["Today", "Last 7 days", "Last 30 days"];

describe("recencyGroups", () => {
  test("splits threads into today, the last 7 days and the last 30 days, newest first as given", () => {
    expect(
      idsOf([
        thread("a", hoursAgo(1)),
        thread("b", hoursAgo(24 * 3)),
        thread("c", hoursAgo(24 * 20)),
        thread("d", hoursAgo(2)),
      ]),
    ).toEqual([
      ["Today", ["a", "d"]],
      ["Last 7 days", ["b"]],
      ["Last 30 days", ["c"]],
    ]);
  });

  test("today starts at midnight, not 24 hours ago", () => {
    expect(idsOf([thread("late", hoursAgo(14)), thread("early", hoursAgo(16))])).toEqual([
      ["Today", ["late"]],
      ["Last 7 days", ["early"]],
      ["Last 30 days", []],
    ]);
  });

  test("always has the three groups, in order, empty or not", () => {
    expect(idsOf([thread("old", hoursAgo(24 * 15))])).toEqual([
      ["Today", []],
      ["Last 7 days", []],
      ["Last 30 days", ["old"]],
    ]);
    expect(idsOf([]).map(([label]) => label)).toEqual(EMPTY);
  });

  test("a thread older than 30 days is not dropped, it stays in the last group until it is archived", () => {
    expect(idsOf([thread("stale", hoursAgo(24 * 45))])).toEqual([
      ["Today", []],
      ["Last 7 days", []],
      ["Last 30 days", ["stale"]],
    ]);
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
      ["Last 7 days", []],
      ["Last 30 days", ["other"]],
    ]);
  });
});
