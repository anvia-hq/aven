import { describe, expect, test } from "bun:test";

import {
  AGENT_BACKEND_CAPABILITIES,
  AGENT_BACKENDS,
  backendRefusal,
  backendSupports,
} from "./runtime-wire";

describe("agent backend capabilities", () => {
  test("native, Claude and Codex all support every capability", () => {
    expect(AGENT_BACKENDS).toEqual(["native", "claude", "codex"]);
    for (const capability of ["question", "restart", "steering", "goals", "compaction"] as const) {
      expect(backendSupports("native", capability)).toBe(true);
      expect(backendSupports(undefined, capability)).toBe(true);
      expect(backendSupports("claude", capability)).toBe(true);
      expect(backendSupports("codex", capability)).toBe(true);
      expect(AGENT_BACKEND_CAPABILITIES.claude[capability]).toBe(true);
    }
  });

  test("names the refusal for a capability a backend does not have", () => {
    expect(backendRefusal("claude", "steering")).toBe(
      "The Claude agent does not take a message while it is working",
    );
    expect(backendRefusal("claude", "compaction")).toBe(
      "The Claude agent does not compact a thread",
    );
    expect(backendRefusal("claude", "question")).toBe(
      "The Claude agent does not pause for a question",
    );
  });
});
