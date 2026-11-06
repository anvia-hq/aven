import { expect, test } from "bun:test";

import { groupByDay } from "./day-groups";
import type { CommitEntry } from "./hooks/use-center-feed";

const entry = (sha: string, date: string) =>
  ({ project: { id: "p" }, commit: { sha, date } }) as unknown as CommitEntry;

test("groups commits under Today, Yesterday and the date, keeping the order", () => {
  const now = new Date(2026, 10, 10, 15, 0);
  const groups = groupByDay(
    [
      entry("a", new Date(2026, 10, 10, 9).toISOString()),
      entry("b", new Date(2026, 10, 10, 1).toISOString()),
      entry("c", new Date(2026, 10, 9, 23).toISOString()),
      entry("d", new Date(2026, 10, 3, 12).toISOString()),
      entry("e", ""),
    ],
    now,
  );
  expect(
    groups.map((group) => [group.label, group.entries.map(({ commit }) => commit.sha)]),
  ).toEqual([
    ["Today", ["a", "b"]],
    ["Yesterday", ["c"]],
    [expect.stringContaining("3"), ["d"]],
  ]);
});
