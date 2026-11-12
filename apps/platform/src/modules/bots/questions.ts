import type { BotChatMessage, BotQuestion } from "./types";

export function answerText(questions: readonly BotQuestion[], answers: Record<string, string>) {
  const given = questions.map((question) => (answers[question.id] ?? "").trim());

  if (given.length === 1) return given[0]!;

  return given.map((answer, index) => `${index + 1}. ${answer}`).join("\n");
}

export function isOpen(messages: readonly BotChatMessage[], message: BotChatMessage) {
  const at = messages.findIndex((each) => each.id === message.id);

  if (at < 0 || !message.questions) return false;

  return !messages.slice(at + 1).some((each) => each.role === "user" && !each.peer);
}
