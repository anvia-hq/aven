import { createTool } from "@anvia/core";
import { BOT_CHOICES_MAX, BOT_QUESTIONS_MAX, type BotQuestion } from "@aven/protocol/bots";
import type { BotQuestioned } from "@aven/protocol/runtime-wire";
import { z } from "zod";

export const ASK_QUESTION_TOOL_NAME = "ask_question";

// A choice is what the person reads and what they send back: the same words, so that what they
// click is what they said, whatever the bot would have liked it to mean (`toQuestions`).
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

/** The questions as the chat shows them: each choice's value is its label, whatever else was sent. */
export const toQuestions = (questions: QuestionsInput): BotQuestion[] =>
  questions.map((question) => ({
    ...question,
    choices: question.choices?.map(({ label }) => ({ label, value: label })),
  }));

export const askQuestionSchema = z.object({ questions: botQuestionsSchema });

/** What the host does with the questions: shows them to the person, or has the main bot ask. */
export type AskQuestion = (questions: BotQuestion[]) => Promise<BotQuestioned>;

const SHOWN =
  "The question is on the person's screen. Stop now and send nothing else: their answer arrives as their next message.";

const relayed = (name: string) =>
  `${name} will ask the person for you and send you the answer as a message. Stop now and send nothing else.`;

// How a bot asks its person to decide (decision 0066): a card with a few choices. The tool ends the
// bot's turn, and the answer comes back as an ordinary message, which keeps the reply short.
export function createAskQuestionTool(ask: AskQuestion) {
  return createTool({
    name: ASK_QUESTION_TOOL_NAME,
    description:
      "Ask the person one or more multiple-choice questions. Use it only when you cannot go on without their decision. Give two to five short, distinct choices and set allowCustom when another answer is plausible. The question appears as a card in the chat and your turn ends there; their answer arrives as their next message.",
    inputSchema: askQuestionSchema,
    async execute({ questions }) {
      const { relayed: via } = await ask(toQuestions(questions));
      if (!via) return { shown: true, note: SHOWN };
      return { relayed: via, note: relayed(via.name) };
    },
  });
}
