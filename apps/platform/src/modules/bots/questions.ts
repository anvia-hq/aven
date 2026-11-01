import type { BotQuestion } from "./types";

/**
 * What the person says back to a bot that asked (decision 0066): the answer alone for one question,
 * and each question with its answer when there are several. It is an ordinary message, so it is
 * what the bot reads and what the chat shows.
 */
export function answerText(questions: readonly BotQuestion[], answers: Record<string, string>) {
  const answered = questions.map((question) => ({
    text: question.text,
    value: (answers[question.id] ?? "").trim(),
  }));
  if (answered.length === 1) return answered[0]!.value;
  return answered.map(({ text, value }) => `${text} ${value}`).join("\n");
}
