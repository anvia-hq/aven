import { describe, expect, test } from "bun:test";

import { createMessageBotTool, MESSAGE_BOT_TOOL_NAME, type MessageBotInput } from "./message-bot";

const SCOUT = "11111111-2222-4333-8444-555555555555";

describe("message_bot", () => {
  test("hands the host the bot and the text, and returns what the bot sent back", async () => {
    const asked: MessageBotInput[] = [];
    const tool = createMessageBotTool(
      async (input) => (asked.push(input), { replies: ["A", "B"] }),
    );

    const result = await tool.call({ bot: SCOUT, text: " do A and B " });

    expect(tool.name).toBe(MESSAGE_BOT_TOOL_NAME);
    expect(asked).toEqual([{ bot: SCOUT, text: "do A and B" }]);
    expect(result).toEqual({ replies: ["A", "B"] });
  });

  test("says so when the bot had nothing to say", async () => {
    const tool = createMessageBotTool(async () => ({ replies: [] }));
    expect(await tool.call({ bot: SCOUT, text: "hi" })).toEqual({
      replies: [],
      note: "It sent nothing back: it had nothing to say.",
    });
  });

  test("a name in place of an id, or nothing to say, is refused before the host is asked", async () => {
    const asked: MessageBotInput[] = [];
    const tool = createMessageBotTool(async (input) => (asked.push(input), { replies: [] }));

    await expect(tool.call({ bot: "Scout", text: "hi" })).rejects.toThrow();
    await expect(tool.call({ bot: SCOUT, text: "  " })).rejects.toThrow();
    expect(asked).toEqual([]);
  });

  test("a refusal of the host reaches the model as the tool's error", async () => {
    const tool = createMessageBotTool(async () => {
      throw new Error("Scout has not answered yet");
    });
    await expect(tool.call({ bot: SCOUT, text: "hi" })).rejects.toThrow("has not answered");
  });
});
