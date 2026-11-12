import { describe, expect, test } from "bun:test";

import { forkIdOf } from "./fork-id";
import { messageBlocks } from "./message-blocks";
import type { ToolPart } from "./types";

const tool = (patch: Partial<ToolPart>): ToolPart => ({
  id: "t1",
  name: "fork_thread",
  target: "do the thing",
  status: "done",
  output: JSON.stringify({ id: "11111111-1111-4111-8111-111111111111", title: "Fork" }),
  ...patch,
});

describe("forkIdOf", () => {
  test("reads the id a finished fork_thread call returned", () => {
    expect(forkIdOf(tool({}))).toBe("11111111-1111-4111-8111-111111111111");
  });

  test("is undefined while running, on failure text, or for another tool", () => {
    expect(forkIdOf(tool({ status: "running", output: undefined }))).toBeUndefined();
    expect(forkIdOf(tool({ status: "error", output: "Cannot fork" }))).toBeUndefined();
    expect(forkIdOf(tool({ output: "not json" }))).toBeUndefined();
    expect(forkIdOf(tool({ name: "fork_status" }))).toBeUndefined();
  });

  test("a finished fork becomes its own block, outside the tool group", () => {
    const blocks = messageBlocks([{ type: "tool", tool: tool({}) }]);
    expect(blocks).toEqual([
      { type: "fork", tool: tool({}), forkId: "11111111-1111-4111-8111-111111111111" },
    ]);
  });
});
