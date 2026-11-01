import type { BotChatMessage, BotQuestion } from "./types";

/**
 * What the person says back to a bot that asked (decision 0066): the answer alone for one question,
 * and the answers in the order asked, numbered, for several. Only what the person picked or wrote
 * goes in: the bot's own words about its questions are not put in their mouth.
 */
export function answerText(questions: readonly BotQuestion[], answers: Record<string, string>) {
  const given = questions.map((question) => (answers[question.id] ?? "").trim());
  if (given.length === 1) return given[0]!;
  return given.map((answer, index) => `${index + 1}. ${answer}`).join("\n");
}

/**
 * Whether a question is still waiting for its answer: until the person says something after it. What
 * other bots write to this one in the meantime does not answer it, nor does the bot going on.
 */
export function isOpen(messages: readonly BotChatMessage[], message: BotChatMessage) {
  const at = messages.findIndex((each) => each.id === message.id);
  if (at < 0 || !message.questions) return false;
  return !messages.slice(at + 1).some((each) => each.role === "user" && !each.peer);
}
