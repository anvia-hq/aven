import { describe, expect, test } from "bun:test";

import { BOT_CHOICES_MAX, BOT_QUESTIONS_MAX } from "./bots";
import { botQuestionsSchema, toQuestions } from "./ask-question";

describe("botQuestionsSchema", () => {
  test("accepts valid free-text and multiple-choice questions and trims fields", () => {
    const parsed = botQuestionsSchema.parse([
      {
        id: " scope ",
        text: " Which area? ",
        choices: [{ label: " API " }, { label: " Web " }],
        allowCustom: true,
      },
      { id: "notes", text: "Any extra details?" },
    ]);

    expect(toQuestions(parsed)).toEqual([
      {
        id: "scope",
        text: "Which area?",
        choices: [
          { label: "API", value: "API" },
          { label: "Web", value: "Web" },
        ],
        allowCustom: true,
      },
      {
        id: "notes",
        text: "Any extra details?",
        choices: undefined,
      },
    ]);
  });

  test("rejects empty lists, too many questions, and duplicate question ids", () => {
    expect(botQuestionsSchema.safeParse([]).success).toBe(false);

    const tooMany = Array.from({ length: BOT_QUESTIONS_MAX + 1 }, (_, i) => ({
      id: `q${i}`,
      text: "Question?",
    }));
    expect(botQuestionsSchema.safeParse(tooMany).success).toBe(false);

    expect(
      botQuestionsSchema.safeParse([
        { id: "dup", text: "First?" },
        { id: " dup ", text: "Second?" },
      ]).success,
    ).toBe(false);
  });

  test("rejects fewer than two choices, too many choices, blank labels, and duplicate choices", () => {
    expect(
      botQuestionsSchema.safeParse([{ id: "q1", text: "Pick?", choices: [{ label: "Only one" }] }])
        .success,
    ).toBe(false);

    const tooManyChoices = Array.from({ length: BOT_CHOICES_MAX + 1 }, (_, i) => ({
      label: `Option ${i}`,
    }));
    expect(
      botQuestionsSchema.safeParse([{ id: "q1", text: "Pick?", choices: tooManyChoices }]).success,
    ).toBe(false);

    expect(
      botQuestionsSchema.safeParse([
        { id: "q1", text: "Pick?", choices: [{ label: "Yes" }, { label: " Yes " }] },
      ]).success,
    ).toBe(false);

    expect(
      botQuestionsSchema.safeParse([
        { id: "q1", text: "Pick?", choices: [{ label: "  " }, { label: "No" }] },
      ]).success,
    ).toBe(false);
  });
});
