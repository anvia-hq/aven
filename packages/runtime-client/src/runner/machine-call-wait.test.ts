import { describe, expect, test } from "bun:test";

import { machineCallWait } from "./machine-call-wait";

const DEFAULT_WAIT_MS = 6 * 60_000;
const MARGIN_MS = 60_000;

describe("machineCallWait", () => {
  test("adds margin to positive finite timeoutMs", () => {
    expect(machineCallWait({ timeoutMs: 10_000 })).toBe(10_000 + MARGIN_MS);
  });

  test("falls back to default wait for Infinity, NaN, non-positive, or missing values", () => {
    expect(machineCallWait({ timeoutMs: Number.POSITIVE_INFINITY })).toBe(DEFAULT_WAIT_MS);
    expect(machineCallWait({ timeoutMs: Number.NEGATIVE_INFINITY })).toBe(DEFAULT_WAIT_MS);
    expect(machineCallWait({ timeoutMs: Number.NaN })).toBe(DEFAULT_WAIT_MS);
    expect(machineCallWait({ timeoutMs: 0 })).toBe(DEFAULT_WAIT_MS);
    expect(machineCallWait({ timeoutMs: -500 })).toBe(DEFAULT_WAIT_MS);
    expect(machineCallWait({ timeoutMs: "10000" })).toBe(DEFAULT_WAIT_MS);
    expect(machineCallWait(undefined)).toBe(DEFAULT_WAIT_MS);
  });
});
