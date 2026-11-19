import { ConflictError } from "@aven/server-kit/errors";

import { parseSaved } from "../runs/continuation";

export const DECLINED = "declined";

export function declinedAnswer(continuation: unknown) {
  const saved = parseSaved(continuation);
  const { interaction } = saved;

  if (interaction.type !== "tool-question")
    throw new ConflictError("The agent is not waiting for an answer to a question");

  return {
    continuation: {
      ...saved,
      interaction: {
        ...interaction,
        questions: interaction.questions.map((question) => ({ ...question, allowCustom: true })),
      },
    },
    answers: interaction.questions.map((question) => ({
      questionId: question.id,
      value: DECLINED,
    })),
  };
}
