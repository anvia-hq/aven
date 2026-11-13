import type { Message, ToolResultOutput } from "@anvia/core";
import {
  BOT_REACTIONS_MAX,
  incomingMessageId,
  parseBotPrompt,
  sentMessageId,
  USER_HANDLE,
} from "@aven/protocol/bots";

import { providerKeyQuestion } from "@aven/protocol/providers";

import { sentMessage } from "./attachments";
import { ASK_QUESTION_TOOL_NAME, askQuestionSchema, toQuestions } from "./tools/ask-question";
import { ASK_PROVIDER_KEY_TOOL_NAME } from "./tools/providers";
import { REACT_TO_MESSAGE_TOOL_NAME, reactToMessageSchema } from "./tools/react-to-message";
import { SEND_MESSAGE_TOOL_NAME, sendMessageSchema } from "./tools/send-message";
import type {
  BotChatMessage,
  BotChatQuote,
  BotQuestion,
  MessageAttachment,
  ProviderKeyAsk,
  ToolArtifact,
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

function artifactsSentIn(output: ToolResultOutput | undefined): ToolArtifact[] | undefined {
  if (output?.type !== "json") return undefined;

  const { artifacts } = output.value as { artifacts?: unknown };

  if (!Array.isArray(artifacts)) return undefined;

  const kept = artifacts.flatMap((item): ToolArtifact[] => {
    const { name, mediaType, title, size } = (item ?? {}) as Record<string, unknown>;

    if (typeof name !== "string" || typeof mediaType !== "string") return [];

    const artifact: ToolArtifact = { name, mediaType };

    if (typeof title === "string") artifact.title = title;

    if (typeof size === "number") artifact.size = size;

    return [artifact];
  });
  return kept.length ? kept : undefined;
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
    {
      peer,
      questions,
      attachments,
      artifacts,
      quote,
      id,
    }: {
      peer?: BotChatMessage["peer"];
      questions?: BotQuestion[];
      attachments?: MessageAttachment[];
      artifacts?: ToolArtifact[];
      quote?: BotChatQuote;
      id?: string;
    } = {},
  ) => {
    const message: BotChatMessage = {
      id:
        id ??
        (role === "user"
          ? incomingMessageId(chat.filter((each) => each.role === "user").length)
          : sentMessageId(chat.filter((each) => each.role === "bot").length)),
      role,
      text,
    };

    if (peer) message.peer = peer;

    if (questions) message.questions = questions;

    if (attachments?.length) message.attachments = attachments;

    if (artifacts?.length) message.artifacts = artifacts;

    if (quote) message.quote = quote;

    chat.push(message);
  };
  const quoteOf = (id: string | undefined): BotChatQuote | undefined => {
    if (!id) return undefined;

    const quoted = chat.find((message) => message.id === id);

    if (!quoted) return undefined;

    return quoted.peer
      ? { id: quoted.id, role: quoted.role, text: quoted.text, peer: quoted.peer }
      : { id: quoted.id, role: quoted.role, text: quoted.text };
  };
  const react = (id: string, emoji: string) => {
    const target = chat.find((message) => message.id === id);
    const reactions = target?.reactions ?? [];

    if (!target || reactions.includes(emoji) || reactions.length >= BOT_REACTIONS_MAX) return;

    target.reactions = [...reactions, emoji];
  };

  for (const [at, message] of messages.entries()) {
    if (message.role === "user") {
      const sent = sentMessage(message);
      const { from, note, text, id, quoted } = parseBotPrompt(sent.text.trim());

      if (note || (!text && !sent.attachments?.length)) continue;

      add("user", text, {
        peer: from ? { name: from, handle: from, direction: "from" } : undefined,
        attachments: sent.attachments,
        quote: quoteOf(quoted),
        id,
      });
    } else if (message.role === "assistant" && typeof message.content !== "string") {
      const results = resultsAfter(messages, at);
      for (const part of message.content) {
        if (part.type !== "tool-call" || failed(results.get(part.toolCallId))) continue;

        if (part.toolName === SEND_MESSAGE_TOOL_NAME) {
          const sent = sendMessageSchema.safeParse(part.input);

          if (!sent.success) continue;

          const { to, text, quote } = sent.data;
          const peer =
            to === USER_HANDLE ? undefined : { name: to, handle: to, direction: "to" as const };
          add("bot", text, {
            peer,
            quote: quoteOf(quote),
            artifacts: artifactsSentIn(results.get(part.toolCallId)),
          });
        } else if (part.toolName === REACT_TO_MESSAGE_TOOL_NAME) {
          const reacted = reactToMessageSchema.safeParse(part.input);

          if (!reacted.success) continue;

          react(reacted.data.messageId, reacted.data.emoji);
        } else if (part.toolName === ASK_QUESTION_TOOL_NAME) {
          const asked = askQuestionSchema.safeParse(part.input);

          if (!asked.success) continue;

          const relayed = relayedBy(results.get(part.toolCallId));

          if (relayed) {
            add("bot", relayed.text, {
              peer: { name: relayed.handle, handle: relayed.handle, direction: "to" },
            });
          } else {
            const questions = toQuestions(asked.data.questions);
            add("bot", questions.map((question) => question.text).join("\n"), { questions });
          }
        } else if (part.toolName === ASK_PROVIDER_KEY_TOOL_NAME) {
          const asked = keyAskedFor(results.get(part.toolCallId));

          if (!asked) continue;

          const question = providerKeyQuestion(asked);
          add("bot", question.text, { questions: [question] });
        }
      }
    }
  }
  return chat;
}
