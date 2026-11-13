import { describe, expect, test } from "bun:test";

import {
  CLAUDE_MODELS,
  claudeEffortOf,
  claudeNameOf,
  claudeVersionOf,
  isClaudeEffort,
} from "./claude-models";

describe("claude models", () => {
  test("a name carries the version the alias resolves to", () => {
    expect(claudeNameOf("sonnet")).toBe("Sonnet 5.5");
    expect(claudeNameOf(undefined)).toBe("Sonnet 5.5");
    expect(claudeNameOf("fable")).toBe("Fable 5.2");
    expect(claudeNameOf("claude-x")).toBe("claude-x");
    expect(claudeVersionOf("claude-haiku-5-5")).toBe("5.5");
  });

  test("only a known effort level is one", () => {
    expect(isClaudeEffort("xhigh")).toBe(true);
    expect(isClaudeEffort("extreme")).toBe(false);
    expect(isClaudeEffort(undefined)).toBe(false);
    expect(claudeEffortOf("high")).toBe("high");
    expect(claudeEffortOf("extreme")).toBeUndefined();
  });

  test("exactly one model is the default", () => {
    expect(CLAUDE_MODELS.filter((model) => model.isDefault)).toHaveLength(1);
  });
});
