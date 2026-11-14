import { describe, expect, test } from "bun:test";

import { createDeleteBotTool, DELETE_BOT_TOOL_NAME } from "./delete-bot";

describe("delete_bot", () => {
  test("hands the host the handle and says what was deleted", async () => {
    const asked: string[] = [];
    const tool = createDeleteBotTool(
      async ({ handle }) => (asked.push(handle), { name: "Scout", handle }),
    );

    const result = await tool.call({ handle: " scout " });

    expect(tool.name).toBe(DELETE_BOT_TOOL_NAME);
    expect(asked).toEqual(["scout"]);
    expect(result).toEqual({ deleted: true, name: "Scout", handle: "scout" });
  });

  test("a blank handle is not asked for, and a refusal reaches the model", async () => {
    const tool = createDeleteBotTool(async () => {
      throw new Error("The main bot cannot be deleted");
    });

    await expect(tool.call({ handle: " " })).rejects.toThrow();
    await expect(tool.call({ handle: "main" })).rejects.toThrow("main bot");
  });
});
