import { describe, expect, test } from "bun:test";

import { summarizeBlocks, summarizeTools } from "./tool-summary";
import type { Block, ToolPart } from "./types";

const tool = (overrides: Partial<ToolPart>): ToolPart => ({
  id: "t1",
  name: "exec_command",
  target: "",
  status: "done",
  ...overrides,
});

describe("summarizeTools", () => {
  test("groups counts by tool kind and deduplicates edited files", () => {
    expect(
      summarizeTools([
        tool({ id: "c1", name: "exec_command", target: "bun test" }),
        tool({ id: "c2", name: "exec_command", target: "bun check" }),
        tool({ id: "c3", name: "exec_command", target: "bun lint" }),
        tool({ id: "e1", name: "edit", target: "src/a.ts" }),
        tool({ id: "e2", name: "edit", target: "src/a.ts" }),
        tool({ id: "e3", name: "apply_patch", target: "src/b.ts" }),
        tool({ id: "o1", name: "custom_mcp_tool" }),
      ]),
    ).toBe("Ran 3 commands, edited 2 files, used a tool");
  });

  test("falls back to Thought when no tool calls are present", () => {
    expect(summarizeTools([])).toBe("Thought");
  });
});

describe("summarizeBlocks", () => {
  test("summarizes tools across tool and subagent blocks", () => {
    const blocks: Block[] = [
      {
        type: "tools",
        entries: [
          { type: "reasoning", text: "Checking" },
          { type: "tool", tool: tool({ id: "r1", name: "read_file", target: "a.ts" }) },
          { type: "tool", tool: tool({ id: "r2", name: "read_file", target: "b.ts" }) },
        ],
      },
      { type: "text", text: "Interim note" },
      {
        type: "tools",
        entries: [{ type: "tool", tool: tool({ id: "c1", name: "exec_command", target: "ls" }) }],
      },
    ];
    expect(summarizeBlocks(blocks)).toBe("Read 2 files, ran a command");
  });
});
