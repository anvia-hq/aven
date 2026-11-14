import { describe, expect, test } from "bun:test";

import { lineOf, toneClass } from "./runtime-sparkline";

describe("lineOf", () => {
  test("draws one segment per point after the first, scaled to the peak", () => {
    expect(lineOf([0, 50, 100]).match(/L/g)).toHaveLength(2);
    expect(lineOf([10, 10])).toBe("M0 0 L120 0");
  });

  test("draws a flat baseline for a single reading, and nothing for none", () => {
    expect(lineOf([])).toBe("");
    expect(lineOf([0])).toContain("L120.0");
  });

  test("colors each load band like its meter", () => {
    expect(toneClass.low).toBe("text-meter-low");
    expect(toneClass.busy).toBe("text-meter");
    expect(toneClass.high).toBe("text-destructive");
  });
});
