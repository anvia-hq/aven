import { describe, expect, test } from "bun:test";

import { claudeBackendSetting } from "./flag";

describe("claudeBackendSetting", () => {
  test("the Claude agent is on unless it is turned off", () => {
    expect(claudeBackendSetting(undefined)).toBe(true);
    expect(claudeBackendSetting("")).toBe(true);
    expect(claudeBackendSetting(" on ")).toBe(true);
    expect(claudeBackendSetting("off")).toBe(false);
  });

  test("a value that is neither on nor off is refused", () => {
    expect(() => claudeBackendSetting("false")).toThrow('must be on or off, got "false"');
  });
});
