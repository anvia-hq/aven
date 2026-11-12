import type { AgentStreamEvent, AssistantContentPart, Message } from "@anvia/core";
import { reasoningDisplayText } from "@anvia/core/completion";

import { messageId } from "@aven/protocol/events";

import { sentMessage } from "./attachments";
import {
  projectToolCall,
  projectToolEnd,
  projectToolOutput,
  withSubagentResults,
} from "./tool-projection";
import { contextOf, tokenUsageOf } from "./usage";
import type { ChatMessage, MessagePart, RunEvent } from "@aven/protocol/types";

export function projectStreamEvent(event: AgentStreamEvent): RunEvent | undefined {
  switch (event.type) {
    case "text_delta":
      return { type: "text", delta: event.delta };
    case "reasoning_delta":
      return { type: "reasoning", delta: event.delta };
    case "tool_call":
      return { type: "tool_start", tool: projectToolCall(event.toolCall) };
    case "tool_result":
      return projectToolEnd(event.toolCallId, event.output, event.toolName);
    case "turn_end":
      return {
        type: "usage",
        turn: tokenUsageOf(event.response.usage),
        context: contextOf(event.response.contextUsage),
      };
    default:
      return undefined;
  }
}

export function projectSubagentEvent(
  event: AgentStreamEvent<unknown, unknown>,
  index: number,
): RunEvent | undefined {
  switch (event.type) {
    case "tool_call": {
      const { id, name, target, status } = projectToolCall(event.toolCall);
      return {
        type: "subagent",
        index,
        event: { type: "tool_start", tool: { id, name, target, status } },
      };
    }
    case "tool_result": {
      const { id, status } = projectToolEnd(event.toolCallId, event.output, event.toolName);
      return { type: "subagent", index, event: { type: "tool_end", id, status } };
    }
    case "turn_end":
      return { type: "usage", turn: tokenUsageOf(event.response.usage) };
    default:
      return undefined;
  }
}

function assistantParts(content: string | readonly AssistantContentPart[]): MessagePart[] {
  if (typeof content === "string") return content.trim() ? [{ type: "text", text: content }] : [];

  const parts: MessagePart[] = [];
  for (const part of content) {
    if (part.type === "text" && part.text.trim()) parts.push({ type: "text", text: part.text });

    if (part.type === "reasoning") {
      const text = reasoningDisplayText(part);

      if (text.trim()) parts.push({ type: "reasoning", text });
    }

    if (part.type === "tool-call") parts.push({ type: "tool", tool: projectToolCall(part) });
  }
  return parts;
}

export function messagesToChat(messages: readonly Message[]): ChatMessage[] {
  const chat: ChatMessage[] = [];
  const add = (role: ChatMessage["role"], parts: MessagePart[]) => {
    chat.push({ id: messageId(chat.length), role, parts });
  };
  const lastAssistant = () => (chat.at(-1)?.role === "assistant" ? chat.at(-1) : undefined);

  for (const message of messages) {
    if (message.role === "user") {
      const { text, attachments, mentions } = sentMessage(message);
      const user: ChatMessage = {
        id: messageId(chat.length),
        role: "user",
        parts: [{ type: "text", text }],
      };

      if (attachments?.length) user.attachments = attachments;

      if (mentions?.length) user.mentions = mentions;

      chat.push(user);
    } else if (message.role === "assistant") {
      const parts = assistantParts(message.content);
      const current = lastAssistant();

      if (current) current.parts.push(...parts);
      else add("assistant", parts);
    } else if (message.role === "tool") {
      const current = lastAssistant();
      for (const part of message.content) {
        if (part.type !== "tool-result" || !current) continue;

        const target = current.parts.find(
          (candidate) => candidate.type === "tool" && candidate.tool.id === part.toolCallId,
        );

        if (target?.type === "tool") {
          const { status, output, artifacts } = projectToolOutput(part.output, target.tool.name);
          target.tool.status = status;
          target.tool.output = output;

          if (artifacts) target.tool.artifacts = artifacts;

          const { subagents } = withSubagentResults(target.tool, part.output);

          if (subagents) target.tool.subagents = subagents;
        }
      }
    }
  }
  return chat;
}
