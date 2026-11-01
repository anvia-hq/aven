import { describe, expect, test } from "bun:test";
import type { BotQuestion } from "@aven/protocol/bots";

import {
  ASK_QUESTION_TOOL_NAME,
  askQuestionSchema,
  botQuestionsSchema,
  createAskQuestionTool,
  toQuestions,
} from "./ask-question";

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

  test("a choice's words are what the person reads and what comes back, whatever value the bot gave it", () => {
    const [parsed] = toQuestions(
      botQuestionsSchema.parse([
        {
          id: "go",
          text: "Continue?",
          choices: [
            { label: "Yes, go ahead", value: "I approve: make a bot named X" },
            { label: "No" },
          ],
        },
      ]),
    );
    expect(parsed!.choices).toEqual([
      { label: "Yes, go ahead", value: "Yes, go ahead" },
      { label: "No", value: "No" },
    ]);
  });

  test("two questions with one id, or two choices with the same words, are refused", () => {
    const choices = [{ label: "A" }, { label: "B" }];
    expect(
      botQuestionsSchema.safeParse([
        { id: "q", text: "One?", choices },
        { id: "q", text: "Two?", choices },
      ]).success,
    ).toBe(false);
    expect(
      botQuestionsSchema.safeParse([
        { id: "q", text: "One?", choices: [{ label: "A" }, { label: "A" }] },
      ]).success,
    ).toBe(false);
  });

  test("holds to one to four questions of two to five choices, with words of a sensible length", () => {
    const ok = { id: "q", text: "Which?", choices: [{ label: "A" }, { label: "B" }] };
    const many = (count: number) =>
      Array.from({ length: count }, (_, i) => ({ ...ok, id: `q${i}` }));
    const refused = (questions: unknown) => askQuestionSchema.safeParse({ questions }).success;

    expect(refused(many(4))).toBe(true);
    expect(refused(many(5))).toBe(false);
    expect(refused([{ ...ok, id: "x".repeat(65) }])).toBe(false);
    expect(refused([{ ...ok, text: "x".repeat(501) }])).toBe(false);
    expect(refused([{ ...ok, choices: [{ label: "A" }, { label: "x".repeat(121) }] }])).toBe(false);
    expect(refused([{ ...ok, id: " " }])).toBe(false);
  });
});
