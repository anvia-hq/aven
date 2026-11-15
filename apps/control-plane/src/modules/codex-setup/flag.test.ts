import { describe, expect, test } from "bun:test";

import { codexBackendSetting } from "./flag";

describe("codexBackendSetting", () => {
  test("the Codex agent is on unless it is turned off", () => {
    expect(codexBackendSetting(undefined)).toBe(true);
    expect(codexBackendSetting("")).toBe(true);
    expect(codexBackendSetting(" on ")).toBe(true);
    expect(codexBackendSetting("off")).toBe(false);
  });

  test("a value that is neither on nor off is refused", () => {
    expect(() => codexBackendSetting("false")).toThrow('must be on or off, got "false"');
  });
});
