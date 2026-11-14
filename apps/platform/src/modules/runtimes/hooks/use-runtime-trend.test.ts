import { describe, expect, test } from "bun:test";

import { emptyTrend, trendAppend, trendHistory, trendPrevious } from "./use-runtime-trend";

describe("trendAppend", () => {
  test("keeps one point per report, newest twenty at most", () => {
    const first = trendAppend([], "at-one", [40, null, 10]);
    expect(trendAppend(first, "at-one", [41, null, 11])).toEqual(first);

    const second = trendAppend(first, "at-two", [41, null, 11]);
    expect(second.map((point) => point.values[0])).toEqual([40, 41]);

    let trail = second;
    for (let index = 0; index < 25; index += 1) {
      trail = trendAppend(trail, `at-${index}`, [index, null, index]);
    }
    expect(trail).toHaveLength(20);
    expect(trail.at(-1)?.values[0]).toBe(24);
  });
});

describe("trendPrevious", () => {
  test("is the value before the latest report, and nothing before two reports", () => {
    const one = trendAppend([], "at-one", [40, null, 10]);
    expect(trendPrevious(one, 0)).toBeNull();

    const two = trendAppend(one, "at-two", [44, null, 10]);
    expect(trendPrevious(two, 0)).toBe(40);
    expect(trendPrevious(two, 1)).toBeNull();
    expect(trendPrevious(two, 2)).toBe(10);
  });
});

describe("trendHistory", () => {
  test("draws only readings the machine gave, and only from two readings on", () => {
    expect(trendHistory([])).toEqual([]);
    expect(trendHistory([null, undefined])).toEqual([]);
    expect(trendHistory([40, null, 44])).toEqual([40, 44]);
    expect(trendHistory([40])).toEqual([]);
  });

  test("starts every runtime with no history and no previous reading", () => {
    expect(emptyTrend().history.cpu).toEqual([]);
    expect(emptyTrend().previous.cpu).toBeNull();
  });
});
