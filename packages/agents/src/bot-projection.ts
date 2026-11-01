import type { Message, ToolResultOutput } from "@anvia/core";
import {
  botMessageId,
  parseBotPrompt,
  USER_HANDLE,
  type BotChatMessage,
  type BotQuestion,
} from "@aven/protocol/bots";

import { ASK_QUESTION_TOOL_NAME, askQuestionSchema } from "./tools/ask-question";
import { SEND_MESSAGE_TOOL_NAME, sendMessageSchema } from "./tools/send-message";

const textOf = (content: Extract<Message, { role: "user" }>["content"]) =>
  typeof content === "string"
    ? content
    : content.map((part) => (part.type === "text" ? part.text : "")).join("");

// What each tool call of an assistant message was answered with, by the call's id, read from the
// tool results that follow it. A provider may reuse an id from one turn to the next, so the results
// are read from the next message only.
function resultsAfter(messages: readonly Message[], at: number) {
  const results = new Map<string, ToolResultOutput>();
  const answers = messages[at + 1];
  if (answers?.role !== "tool") return results;
  for (const part of answers.content) {
    if (part.type === "tool-result") results.set(part.toolCallId, part.output);
  }
  return results;
}

// A call that failed was refused, so what it carried was never sent or shown.
const failed = (output: ToolResultOutput | undefined) =>
  output?.type === "error-text" || output?.type === "error-json";

// What a call to `ask_question` was answered with: asked of the person, or of the main bot.
function relayedBy(output: ToolResultOutput | undefined) {
  if (output?.type !== "json") return undefined;
  const { relayed } = output.value as { relayed?: { handle?: unknown; text?: unknown } };
  if (typeof relayed?.handle !== "string" || typeof relayed.text !== "string") return undefined;
  return { handle: relayed.handle, text: relayed.text };
}

// Rebuilds a bot's chat from its stored memory: what the person said, each message the bot sent
// with `send_message`, and, between bots (decision 0065), what another bot wrote to it and what it
// wrote to another, if it was sent. Whatever else the bot wrote or did is not part of the chat, nor is a note from
// the app. A bot is known by its handle here; the name is the platform's to find.
export function botMessagesToChat(messages: readonly Message[]): BotChatMessage[] {
  const chat: BotChatMessage[] = [];
  const add = (
    role: BotChatMessage["role"],
    text: string,
    peer?: BotChatMessage["peer"],
    questions?: BotQuestion[],
  ) => {
    const message: BotChatMessage = { id: botMessageId(chat.length), role, text };
    if (peer) message.peer = peer;
    if (questions) message.questions = questions;
    chat.push(message);
  };

  for (const [at, message] of messages.entries()) {
    if (message.role === "user") {
      const { from, note, text } = parseBotPrompt(textOf(message.content).trim());
      if (note || !text) continue;
      add("user", text, from ? { name: from, handle: from, direction: "from" } : undefined);
    } else if (message.role === "assistant" && typeof message.content !== "string") {
      const results = resultsAfter(messages, at);
      for (const part of message.content) {
        if (part.type !== "tool-call" || failed(results.get(part.toolCallId))) continue;
        if (part.toolName === SEND_MESSAGE_TOOL_NAME) {
          const sent = sendMessageSchema.safeParse(part.input);
          if (!sent.success) continue;
          const { to, text } = sent.data;
          const peer =
            to === USER_HANDLE ? undefined : { name: to, handle: to, direction: "to" as const };
          add("bot", text, peer);
        } else if (part.toolName === ASK_QUESTION_TOOL_NAME) {
          const asked = askQuestionSchema.safeParse(part.input);
          if (!asked.success) continue;
          const relayed = relayedBy(results.get(part.toolCallId));
          if (relayed) {
            add("bot", relayed.text, {
              name: relayed.handle,
              handle: relayed.handle,
              direction: "to",
            });
          } else {
            const { questions } = asked.data;
            add("bot", questions.map((question) => question.text).join("\n"), undefined, questions);
          }
        }
      }
    }
  }
  return chat;
}
