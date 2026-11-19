import { describe, expect, test } from "bun:test";

import { ringDashOffset } from "./metric-ring";

const FULL = 2 * Math.PI * 20;

describe("ringDashOffset", () => {
  test("draws no arc when the load is unknown or zero", () => {
    expect(ringDashOffset(null)).toBeCloseTo(FULL, 5);
    expect(ringDashOffset(0)).toBeCloseTo(FULL, 5);
  });

  test("draws half the ring at 50% and all of it at 100%", () => {
    expect(ringDashOffset(50)).toBeCloseTo(FULL / 2, 5);
    expect(ringDashOffset(100)).toBeCloseTo(0, 5);
  });

  test("clamps a load beyond 0 to 100", () => {
    expect(ringDashOffset(140)).toBeCloseTo(0, 5);
    expect(ringDashOffset(-10)).toBeCloseTo(FULL, 5);
  });
});
