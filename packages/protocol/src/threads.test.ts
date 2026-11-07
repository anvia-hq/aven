import { describe, expect, test } from "bun:test";

import {
  BOT_TURN_TEXT_MAX,
  BOT_TURN_TOOLS_MAX,
  BOT_TURNS_SHOWN,
  threadTitleFrom,
  threadTurns,
} from "./threads";
import type { ChatMessage } from "./types";

const user = (id: string, text: string): ChatMessage => ({
  id,
  role: "user",
  parts: [{ type: "text", text }],
});
const tool = (name: string, target: string, output = "OUTPUT") => ({
  type: "tool" as const,
  tool: { id: name + target, name, target, status: "done" as const, output },
});

describe("what a bot is shown of a thread's transcript", () => {
  test("the latest turns, oldest first, with how many came before", () => {
    const messages = Array.from({ length: BOT_TURNS_SHOWN + 3 }, (_, i) =>
      user(`m${i}`, `turn ${i}`),
    );
    const { turns, earlier } = threadTurns(messages);
    expect(earlier).toBe(3);
    expect(turns).toHaveLength(BOT_TURNS_SHOWN);
    expect(turns[0]!.text).toBe("turn 3");
    expect(turns.at(-1)!.text).toBe(`turn ${BOT_TURNS_SHOWN + 2}`);
  });

  test("a tool call is one line with no output, and an answer is its words only", () => {
    const { turns } = threadTurns([
      {
        id: "a",
        role: "assistant",
        parts: [
          { type: "text", text: "Looking." },
          tool("read_file", "src/app.ts", "SECRET=hunter2 and a very long file"),
          { type: "text", text: "Found it." },
        ],
      },
    ]);
    expect(turns).toEqual([
      { role: "assistant", text: "Looking.\n\nFound it.", tools: ["read_file src/app.ts (done)"] },
    ]);
    expect(JSON.stringify(turns)).not.toContain("hunter2");
  });

  test("long words and long lists of calls are cut, keeping the latest calls", () => {
    const calls = Array.from({ length: BOT_TURN_TOOLS_MAX + 5 }, (_, i) =>
      tool("exec_command", `step ${i}`),
    );
    const { turns } = threadTurns([
      {
        id: "a",
        role: "assistant",
        parts: [{ type: "text", text: "x".repeat(BOT_TURN_TEXT_MAX + 50) }, ...calls],
      },
    ]);
    expect(turns[0]!.text.endsWith("… (cut)")).toBe(true);
    expect(turns[0]!.text.length).toBeLessThan(BOT_TURN_TEXT_MAX + 20);
    expect(turns[0]!.tools).toHaveLength(BOT_TURN_TOOLS_MAX);
    expect(turns[0]!.tools!.at(-1)).toContain(`step ${BOT_TURN_TOOLS_MAX + 4}`);
  });

  test("a turn with no tools has none, and an empty transcript has nothing", () => {
    expect(threadTurns([user("m", "hi")]).turns[0]).toEqual({
      role: "user",
      text: "hi",
      tools: undefined,
    });
    expect(threadTurns([])).toEqual({ turns: [], earlier: 0 });
  });
});

describe("a thread's title from its prompt", () => {
  test("is the prompt on one line, cut like the platform cuts it", () => {
    expect(threadTitleFrom("Fix\nthe   build")).toBe("Fix the build");
    expect(threadTitleFrom("x".repeat(60))).toBe(`${"x".repeat(47)}...`);
  });
});
