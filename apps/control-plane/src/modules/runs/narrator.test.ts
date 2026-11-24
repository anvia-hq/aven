import { describe, expect, test } from "bun:test";

import type { ToolPart } from "@aven/protocol/types";

import { createRunNarrator, shouldNarrate } from "./narrator";

const tool = (overrides: Partial<ToolPart>): ToolPart => ({
  id: "t1",
  name: "edit",
  target: "src/app.ts",
  status: "done",
  ...overrides,
});

describe("shouldNarrate", () => {
  test("selects high-signal completed tools and skips noisy exploration", () => {
    expect(shouldNarrate(tool({ name: "edit", status: "done" }))).toBe(true);
    expect(shouldNarrate(tool({ name: "exec_command", status: "done" }))).toBe(true);
    expect(shouldNarrate(tool({ name: "read_file", status: "done" }))).toBe(false);
    expect(shouldNarrate(tool({ name: "grep", status: "done" }))).toBe(false);
    expect(shouldNarrate(tool({ name: "edit", status: "running" }))).toBe(false);
    expect(shouldNarrate(tool({ name: "read_file", status: "error" }))).toBe(true);
  });
});

describe("createRunNarrator", () => {
  test("returns null gracefully when no server small model is configured", async () => {
    const narrator = createRunNarrator(async () => null);
    expect(await narrator.narrate(tool({}))).toBeNull();
  });
});
