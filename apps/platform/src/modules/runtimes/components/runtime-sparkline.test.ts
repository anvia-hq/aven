import { describe, expect, test } from "bun:test";

import { lineOf } from "./runtime-sparkline";

describe("lineOf", () => {
  test("draws one segment per point after the first, scaled to the peak", () => {
    expect(lineOf([0, 50, 100]).match(/L/g)).toHaveLength(2);
    expect(lineOf([10, 10]).split(" ")).toHaveLength(2);
  });

  test("draws nothing with fewer than two points", () => {
    expect(lineOf([])).toBe("");
    expect(lineOf([42])).toBe("");
  });
});
