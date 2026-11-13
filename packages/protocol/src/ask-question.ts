import { z } from "zod";

import { BOT_CHOICES_MAX, BOT_QUESTIONS_MAX } from "./bots";
import type { BotQuestion } from "./types";

const choice = z.object({
  label: z.string().trim().min(1).max(120).describe("What the person reads and answers."),
});

const unique = (values: readonly string[]) => new Set(values).size === values.length;

export const botQuestionsSchema = z
  .array(
    z.object({
      id: z
        .string()
        .trim()
        .min(1)
        .max(64)
        .describe("A short name for the question, such as `scope`."),
      text: z.string().trim().min(1).max(500).describe("The question, in a sentence."),
      choices: z
        .array(choice)
        .min(2)
        .max(BOT_CHOICES_MAX)
        .refine((each) => unique(each.map((one) => one.label)), "Give each choice different words.")
        .optional()
        .describe(
          `Two to ${BOT_CHOICES_MAX} short, distinct choices. Leave out for a free answer.`,
        ),
      allowCustom: z
        .boolean()
        .optional()
        .describe("Set when another answer than the choices is plausible."),
    }),
  )
  .min(1)
  .max(BOT_QUESTIONS_MAX)
  .refine((each) => unique(each.map((one) => one.id)), "Give each question its own id.");

type QuestionsInput = z.infer<typeof botQuestionsSchema>;

export const toQuestions = (questions: QuestionsInput): BotQuestion[] =>
  questions.map((question) => ({
    ...question,
    choices: question.choices?.map(({ label }) => ({ label, value: label })),
  }));
