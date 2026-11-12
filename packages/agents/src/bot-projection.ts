import type { Message, ToolResultOutput } from "@anvia/core";
import { botMessageId, parseBotPrompt, USER_HANDLE } from "@aven/protocol/bots";

import { providerKeyQuestion } from "@aven/protocol/providers";

import { sentMessage } from "./attachments";
import { ASK_QUESTION_TOOL_NAME, askQuestionSchema, toQuestions } from "./tools/ask-question";
import { ASK_PROVIDER_KEY_TOOL_NAME } from "./tools/providers";
import { SEND_MESSAGE_TOOL_NAME, sendMessageSchema } from "./tools/send-message";
import type {
  BotChatMessage,
  BotQuestion,
  MessageAttachment,
  ProviderKeyAsk,
} from "@aven/protocol/types";

function resultsAfter(messages: readonly Message[], at: number) {
  const results = new Map<string, ToolResultOutput>();
  const answers = messages[at + 1];

  if (answers?.role !== "tool") return results;

  for (const part of answers.content) {
    if (part.type === "tool-result") results.set(part.toolCallId, part.output);
  }
  return results;
}

const failed = (output: ToolResultOutput | undefined) =>
  output?.type === "error-text" || output?.type === "error-json";

function relayedBy(output: ToolResultOutput | undefined) {
  if (output?.type !== "json") return undefined;

  const { relayed } = output.value as { relayed?: { handle?: unknown; text?: unknown } };

  if (typeof relayed?.handle !== "string" || typeof relayed.text !== "string") return undefined;

  return { handle: relayed.handle, text: relayed.text };
}

function keyAskedFor(output: ToolResultOutput | undefined): ProviderKeyAsk | undefined {
  if (output?.type !== "json") return undefined;

  const { provider } = output.value as { provider?: { providerId?: unknown; name?: unknown } };

  if (typeof provider?.providerId !== "string" || typeof provider.name !== "string") {
    return undefined;
  }

  return { providerId: provider.providerId, name: provider.name };
}

export function botMessagesToChat(messages: readonly Message[]): BotChatMessage[] {
  const chat: BotChatMessage[] = [];
  const add = (
    role: BotChatMessage["role"],
    text: string,
    peer?: BotChatMessage["peer"],
    questions?: BotQuestion[],
    attachments?: MessageAttachment[],
  ) => {
    const message: BotChatMessage = { id: botMessageId(chat.length), role, text };

    if (peer) message.peer = peer;

    if (questions) message.questions = questions;

    if (attachments?.length) message.attachments = attachments;

    chat.push(message);
  };

  for (const [at, message] of messages.entries()) {
    if (message.role === "user") {
      const sent = sentMessage(message);
      const { from, note, text } = parseBotPrompt(sent.text.trim());

      if (note || (!text && !sent.attachments?.length)) continue;

      add(
        "user",
        text,
        from ? { name: from, handle: from, direction: "from" } : undefined,
        undefined,
        sent.attachments,
      );
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
            const questions = toQuestions(asked.data.questions);
            add("bot", questions.map((question) => question.text).join("\n"), undefined, questions);
          }
        } else if (part.toolName === ASK_PROVIDER_KEY_TOOL_NAME) {
          const asked = keyAskedFor(results.get(part.toolCallId));

          if (!asked) continue;

          const question = providerKeyQuestion(asked);
          add("bot", question.text, undefined, [question]);
        }
      }
    }
  }
  return chat;
}
