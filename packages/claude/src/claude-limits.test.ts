import { describe, expect, test } from "bun:test";

import { limitsFromRateLimitEvent, limitsFromUsage } from "./claude-limits";

const eventOfSetupToken = {
  status: "allowed",
  resetsAt: 1794501600,
  rateLimitType: "five_hour",
  overageStatus: "rejected",
  overageDisabledReason: "out_of_credits",
  isUsingOverage: false,
  unifiedWindows: {
    five_hour: { utilization: 0.81, resetsAt: 1794501600, status: "allowed" },
    seven_day: { utilization: 0.12, resetsAt: 1794816000, status: "allowed" },
  },
};

describe("plan limits", () => {
  test("an event from a setup token carries both windows in unifiedWindows", () => {
    expect(limitsFromRateLimitEvent(eventOfSetupToken)).toEqual([
      { window: "five_hour", status: "allowed", percent: 81, resetsAt: 1794501600000 },
      { window: "seven_day", status: "allowed", percent: 12, resetsAt: 1794816000000 },
    ]);
  });

  test("an event with one window at the top level is that window", () => {
    expect(
      limitsFromRateLimitEvent({
        status: "allowed_warning",
        rateLimitType: "seven_day",
        utilization: 90,
        resetsAt: 1794816000,
      }),
    ).toEqual([
      { window: "seven_day", status: "allowed_warning", percent: 90, resetsAt: 1794816000000 },
    ]);
  });

  test("an event with no usage in it is no limits", () => {
    expect(limitsFromRateLimitEvent({ status: "allowed", rateLimitType: "five_hour" })).toEqual([]);
    expect(limitsFromRateLimitEvent(undefined)).toEqual([]);
  });

  test("usage that is not available is no limits", () => {
    expect(limitsFromUsage({ rate_limits_available: false, rate_limits: null })).toEqual([]);
  });
});
