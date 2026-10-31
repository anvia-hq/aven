import { describe, expect, test } from "bun:test";

import { createUpdateSelfTool, UPDATE_SELF_TOOL_NAME, type SelfChanges } from "./update-self";

describe("update_self", () => {
  test("hands the host only what the bot chose to change, and says what the bot is now", async () => {
    const asked: SelfChanges[] = [];
    const tool = createUpdateSelfTool(
      async (changes) => (asked.push(changes), { name: "Scout", description: "Looks things up." }),
    );

    const result = await tool.call({ name: " Scout ", description: "Looks things up." });

    expect(tool.name).toBe(UPDATE_SELF_TOOL_NAME);
    expect(asked).toEqual([{ name: "Scout", description: "Looks things up." }]);
    expect(result).toEqual({ updated: true, name: "Scout", description: "Looks things up." });
  });

  test("an empty description or instruction is a change: it clears", async () => {
    const asked: SelfChanges[] = [];
    const tool = createUpdateSelfTool(
      async (changes) => (asked.push(changes), { name: "Pip", description: "" }),
    );

    await tool.call({ description: "" });
    await tool.call({ instruction: "" });

    expect(asked).toEqual([{ description: "" }, { instruction: "" }]);
  });

  test("changing nothing, or a name with nothing in it, is refused before the host is asked", async () => {
    const asked: SelfChanges[] = [];
    const tool = createUpdateSelfTool(
      async (changes) => (asked.push(changes), { name: "x", description: "" }),
    );

    await expect(tool.call({})).rejects.toThrow("Give a name");
    await expect(tool.call({ name: " " })).rejects.toThrow();
    expect(asked).toEqual([]);
  });

  test("a refusal of the host reaches the model as the tool's error", async () => {
    const tool = createUpdateSelfTool(async () => {
      throw new Error("This bot no longer exists");
    });
    await expect(tool.call({ name: "Scout" })).rejects.toThrow("no longer exists");
  });
});
