import { describe, expect, test } from "bun:test";

import { claudeBackendSetting, codexBackendSetting, hostedKindOf } from "./backends";

describe("the agent backends on this server", () => {
  test("the Claude agent is on unless it is turned off", () => {
    expect(claudeBackendSetting(undefined)).toBe(true);
    expect(claudeBackendSetting("")).toBe(true);
    expect(claudeBackendSetting(" on ")).toBe(true);
    expect(claudeBackendSetting("off")).toBe(false);
  });

  test("the Codex agent is on unless it is turned off", () => {
    expect(codexBackendSetting(undefined)).toBe(true);
    expect(codexBackendSetting("off")).toBe(false);
  });

  test("a value that is neither on nor off is refused", () => {
    expect(() => claudeBackendSetting("false")).toThrow('must be on or off, got "false"');
    expect(() => codexBackendSetting("0")).toThrow('must be on or off, got "0"');
  });

  test("each hosted backend is one provider kind, and nothing is a kind of the native agent", () => {
    expect(hostedKindOf("claude")).toBe("claude-subscription");
    expect(hostedKindOf("codex")).toBe("codex-subscription");
    expect(hostedKindOf("native")).toBeUndefined();
  });
});
