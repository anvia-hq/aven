import { describe, expect, test } from "bun:test";

import { streaksOf } from "./streaks";

describe("streaksOf", () => {
  test("counts the days in a row that end today, or yesterday when today has none yet", () => {
    expect(streaksOf(["2026-03-01", "2026-03-02", "2026-03-03"], "2026-03-03").current).toBe(3);
    expect(streaksOf(["2026-03-01", "2026-03-02"], "2026-03-03").current).toBe(2);
    expect(streaksOf(["2026-02-27", "2026-03-01"], "2026-03-03").current).toBe(0);
  });

  test("keeps the longest run it has seen, across months and a repeated day", () => {
    const streaks = streaksOf(
      ["2026-01-30", "2026-01-31", "2026-02-01", "2026-02-01", "2026-02-04"],
      "2026-02-04",
    );
    expect(streaks).toEqual({ current: 1, longest: 3 });
  });

  test("a day alone is a streak of one, and no day is none", () => {
    expect(streaksOf(["2026-03-03"], "2026-03-03")).toEqual({ current: 1, longest: 1 });
    expect(streaksOf([], "2026-03-03")).toEqual({ current: 0, longest: 0 });
  });
});
