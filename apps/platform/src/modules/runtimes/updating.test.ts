import { describe, expect, test } from "bun:test";

import { isUpdating, UPDATE_WAIT_MS, updateEnd } from "./updating";

const asked = { from: "0.5.6", at: 1_000 };
const online = (build: string | null) => ({ online: true, build });

describe("a runner asked to update (decision 0146)", () => {
  test("is updating while it is offline or still on the release it began on", () => {
    expect(isUpdating(asked, online("0.5.6"), 2_000)).toBe(true);
    expect(isUpdating(asked, { online: false, build: null }, 2_000)).toBe(true);
    expect(isUpdating(asked, online("0.5.7"), 2_000)).toBe(false);
    expect(isUpdating(undefined, online("0.5.6"), 2_000)).toBe(false);
  });

  test("stops being shown as updating when the wait is over", () => {
    expect(isUpdating(asked, online("0.5.6"), 1_000 + UPDATE_WAIT_MS)).toBe(true);
    expect(isUpdating(asked, online("0.5.6"), 1_001 + UPDATE_WAIT_MS)).toBe(false);
  });

  test("has ended when the runner is back on another release, and failed when the wait is over with the same one", () => {
    expect(updateEnd(asked, online("0.5.7"), 2_000)).toBe("done");
    expect(updateEnd(asked, online("0.5.6"), 2_000)).toBeNull();
    expect(updateEnd(asked, online("0.5.6"), 1_001 + UPDATE_WAIT_MS)).toBe("failed");
    // Still offline after the wait: not said to have failed, there is no release to compare.
    expect(updateEnd(asked, { online: false, build: null }, 1_001 + UPDATE_WAIT_MS)).toBeNull();
    expect(updateEnd(undefined, online("0.5.6"), 2_000)).toBeNull();
  });
});
