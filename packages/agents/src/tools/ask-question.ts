import { createTool } from "@anvia/core";
import { botQuestionsSchema, toQuestions } from "@aven/protocol/ask-question";
import { z } from "zod";
import type { AskQuestion } from "./types";

export const ASK_QUESTION_TOOL_NAME = "ask_question";

export const askQuestionSchema = z.object({ questions: botQuestionsSchema });

const SHOWN =
  "The question is on the person's screen. Stop now and send nothing else: their answer arrives as their next message.";

const relayed = (name: string) =>
  `${name} will ask the person for you and send you the answer as a message. Stop now and send nothing else.`;

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
