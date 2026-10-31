import { describe, expect, test } from "bun:test";

import { createCreateBotTool, CREATE_BOT_TOOL_NAME, type NewBotInput } from "./create-bot";

describe("create_bot", () => {
  test("hands the host what the model chose, and says what was made", async () => {
    const asked: NewBotInput[] = [];
    const tool = createCreateBotTool(async (input) => (asked.push(input), { name: "Scout" }));

    const result = await tool.call({ name: " Scout ", instruction: "You research." });

    expect(tool.name).toBe(CREATE_BOT_TOOL_NAME);
    expect(asked).toEqual([{ name: "Scout", instruction: "You research." }]);
    expect(result).toEqual({ created: true, name: "Scout" });
  });

  test("a bot with no name or no instruction is not asked for", async () => {
    const asked: NewBotInput[] = [];
    const tool = createCreateBotTool(async (input) => (asked.push(input), { name: "x" }));

    await expect(tool.call({ name: " ", instruction: "You research." })).rejects.toThrow();
    await expect(tool.call({ name: "Scout", instruction: "" })).rejects.toThrow();
    expect(asked).toEqual([]);
  });

  test("a refusal of the host reaches the model as the tool's error", async () => {
    const tool = createCreateBotTool(async () => {
      throw new Error("You already have 20 bots");
    });
    await expect(tool.call({ name: "Scout", instruction: "x" })).rejects.toThrow("20 bots");
  });
});
