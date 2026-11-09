import { describe, expect, test } from "bun:test";

import { messageBlocks } from "./message-blocks";
import type { MessagePart, ToolPart } from "./types";

const tool = (id: string) => ({ type: "tool", tool: { id, name: "exec_command" } as ToolPart });
const text = (value: string): MessagePart => ({ type: "text", text: value });

describe("a message's blocks", () => {
  test("a gap of whitespace between tool calls does not split their group", () => {
    const blocks = messageBlocks([
      tool("1"),
      text("\n\n"),
      tool("2"),
      text("  "),
      tool("3"),
    ] as MessagePart[]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ type: "tools" });
    expect(blocks[0]?.type === "tools" && blocks[0].entries).toHaveLength(3);
  });

  test("words between tool calls still end a group", () => {
    const blocks = messageBlocks([
      tool("1"),
      text("Now the next step."),
      tool("2"),
    ] as MessagePart[]);
    expect(blocks.map((block) => block.type)).toEqual(["tools", "text", "tools"]);
  });
});
