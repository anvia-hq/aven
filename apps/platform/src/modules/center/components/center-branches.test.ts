import { expect, test } from "bun:test";

import { isStale } from "./center-branches";
import type { BranchSummary } from "../types";

const DAY = 86_400_000;
const now = Date.parse("2026-11-10T00:00:00Z");
const branch = (change: Partial<BranchSummary>): BranchSummary => ({
  name: "dev",
  isDefault: false,
  protected: false,
  ahead: 1,
  behind: 0,
  lastCommit: {
    sha: "a",
    message: "m",
    author: null,
    date: new Date(now - 45 * DAY).toISOString(),
  },
  pull: null,
  ...change,
});

test("a branch is stale when nobody touched it for a month and no pull request is open", () => {
  expect(isStale(branch({}), now)).toBe(true);
  expect(isStale(branch({ pull: { number: 3, title: "t" } }), now)).toBe(false);
  expect(isStale(branch({ isDefault: true }), now)).toBe(false);
  expect(isStale(branch({ lastCommit: null }), now)).toBe(false);
  expect(
    isStale(
      branch({
        lastCommit: {
          sha: "a",
          message: "m",
          author: null,
          date: new Date(now - 10 * DAY).toISOString(),
        },
      }),
      now,
    ),
  ).toBe(false);
});
