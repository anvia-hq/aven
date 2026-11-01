import { describe, expect, test } from "bun:test";
import type { BotQuestion } from "@aven/protocol/bots";

import { ASK_QUESTION_TOOL_NAME, createAskQuestionTool } from "./ask-question";

const question = {
  id: "scope",
  text: "Which first?",
  choices: [
    { label: "Scout", value: "Scout" },
    { label: "Analyst", value: "Analyst" },
  ],
};

describe("ask_question", () => {
  test("hands the host what the model asked and tells the bot to stop, its answer being the person's next message", async () => {
    const asked: BotQuestion[][] = [];
    const tool = createAskQuestionTool(async (questions) => (asked.push(questions), {}));

    const result = await tool.call({ questions: [question] });

    expect(tool.name).toBe(ASK_QUESTION_TOOL_NAME);
    expect(asked).toEqual([[question]]);
    expect(result).toMatchObject({ shown: true });
    expect(JSON.stringify(result)).toContain("Stop now");
  });

  test("says who will ask when the main bot does, so the bot stops all the same", async () => {
    const via = { handle: "main", name: "Aven", text: "Scout needs a decision" };
    const tool = createAskQuestionTool(async () => ({ relayed: via }));

    const result = await tool.call({ questions: [question] });

    expect(result).toMatchObject({ relayed: via });
    expect(JSON.stringify(result)).toContain("Aven will ask the person for you");
  });

  test("a question with no text, one choice, too many choices or no question at all is refused before the host is asked", async () => {
    const asked: BotQuestion[][] = [];
    const tool = createAskQuestionTool(async (questions) => (asked.push(questions), {}));
    const choices = (count: number) =>
      Array.from({ length: count }, (_, i) => ({ label: `${i}`, value: `${i}` }));

    await expect(tool.call({ questions: [] })).rejects.toThrow();
    await expect(tool.call({ questions: [{ ...question, text: " " }] })).rejects.toThrow();
    await expect(
      tool.call({ questions: [{ ...question, choices: choices(1) }] }),
    ).rejects.toThrow();
    await expect(
      tool.call({ questions: [{ ...question, choices: choices(6) }] }),
    ).rejects.toThrow();
    expect(asked).toEqual([]);
  });

  test("a refusal of the host reaches the model as the tool's error", async () => {
    const tool = createAskQuestionTool(async () => {
      throw new Error("Nobody is there to answer");
    });
    await expect(tool.call({ questions: [question] })).rejects.toThrow("Nobody is there");
  });
});
