import type {
  AgentStreamEvent,
  AssistantContentPart,
  Message,
  ToolCallPart,
  ToolResultOutput,
} from "@anvia/core";

import {
  messageId,
  type ChatMessage,
  type DiffLine,
  type MessagePart,
  type RunEvent,
  type ToolPart,
} from "@aven/protocol/events";

import { EDIT_TOOL_NAME } from "./tools/edit";
import { READ_TOOL_NAME } from "./tools/read";
import { SHELL_KILL_TOOL_NAME, SHELL_OUTPUT_TOOL_NAME, SHELL_TOOL_NAME } from "./tools/shell";
import { WEB_SEARCH_TOOL_NAME } from "./tools/web-search";
import { WRITE_TOOL_NAME } from "./tools/write";

// What a client is sent of a tool result; the model sees the full output (see MAX_OUTPUT_CHARS in lib/truncate).
const MAX_UI_OUTPUT_CHARS = 4000;
const MAX_DIFF_LINES = 60;

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};

const asString = (value: unknown) => (typeof value === "string" ? value : "");

export function toolTarget(name: string, input: unknown) {
  const args = asRecord(input);
  switch (name) {
    case READ_TOOL_NAME:
    case WRITE_TOOL_NAME:
    case EDIT_TOOL_NAME:
      return asString(args.path);
    case SHELL_TOOL_NAME:
      return asString(args.command);
    case WEB_SEARCH_TOOL_NAME:
      return asString(args.query);
    case SHELL_OUTPUT_TOOL_NAME:
    case SHELL_KILL_TOOL_NAME:
      return asString(args.jobId);
    default:
      return "";
  }
}

function editDiff(input: unknown): DiffLine[] | undefined {
  const args = asRecord(input);
  if (typeof args.oldString !== "string" || typeof args.newString !== "string") return undefined;
  const lines = (text: string, type: DiffLine["type"]) =>
    text.split("\n").map((line) => ({ type, text: line }));
  return [...lines(args.oldString, "del"), ...lines(args.newString, "add")].slice(
    0,
    MAX_DIFF_LINES,
  );
}

export function projectToolCall(call: ToolCallPart): ToolPart {
  const tool: ToolPart = {
    id: call.toolCallId,
    name: call.toolName,
    target: toolTarget(call.toolName, call.input),
    status: "running",
  };
  if (call.toolName === EDIT_TOOL_NAME) {
    const diff = editDiff(call.input);
    if (diff) tool.diff = diff;
  }
  return tool;
}

function clip(text: string) {
  return text.length > MAX_UI_OUTPUT_CHARS
    ? `${text.slice(0, MAX_UI_OUTPUT_CHARS)}\n… [truncated]`
    : text;
}

// What the UI shows for a tool result: the text a human would read, never the raw payload.
export function projectToolOutput(output: ToolResultOutput): {
  status: "done" | "error";
  output: string;
} {
  switch (output.type) {
    case "text":
      return { status: "done", output: clip(output.value) };
    case "error-text":
      return { status: "error", output: clip(output.value) };
    case "json": {
      const value = asRecord(output.value);
      const text = typeof value.output === "string" ? value.output : JSON.stringify(output.value);
      return { status: "done", output: clip(text) };
    }
    case "error-json":
      return { status: "error", output: clip(JSON.stringify(output.value)) };
    case "content":
      return {
        status: "done",
        // Images and files (a desktop screenshot) are not sent to clients; say that one was there.
        output: clip(
          output.value
            .map((part) => (part.type === "text" ? part.text : `[${part.type}]`))
            .join(""),
        ),
      };
    case "execution-denied":
      return { status: "error", output: output.reason ?? "Tool call was denied" };
    default:
      return assertNever(output);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled tool result: ${JSON.stringify(value)}`);
}

// Only these run events ever reach a client. Turn events carry full history and the system prompt,
// and reasoning/provider payloads are private, so they are dropped here.
export function projectStreamEvent(event: AgentStreamEvent): RunEvent | undefined {
  switch (event.type) {
    case "text_delta":
      return { type: "text", delta: event.delta };
    case "tool_call":
      return { type: "tool_start", tool: projectToolCall(event.toolCall) };
    case "tool_result": {
      const { status, output } = projectToolOutput(event.output);
      return { type: "tool_end", id: event.toolCallId, status, output };
    }
    default:
      return undefined;
  }
}

function userText(message: Extract<Message, { role: "user" }>) {
  if (typeof message.content === "string") return message.content;
  return message.content.map((part) => (part.type === "text" ? part.text : "")).join("");
}

function assistantParts(content: string | readonly AssistantContentPart[]): MessagePart[] {
  if (typeof content === "string") return content ? [{ type: "text", text: content }] : [];
  const parts: MessagePart[] = [];
  for (const part of content) {
    if (part.type === "text" && part.text) parts.push({ type: "text", text: part.text });
    if (part.type === "tool-call") parts.push({ type: "tool", tool: projectToolCall(part) });
  }
  return parts;
}

// Rebuilds the UI transcript from stored memory. An assistant turn spans several stored messages
// (text, tool calls, tool results), which become one assistant message with results paired by id.
export function messagesToChat(messages: readonly Message[]): ChatMessage[] {
  const chat: ChatMessage[] = [];
  const add = (role: ChatMessage["role"], parts: MessagePart[]) => {
    chat.push({ id: messageId(chat.length), role, parts });
  };
  const lastAssistant = () => (chat.at(-1)?.role === "assistant" ? chat.at(-1) : undefined);

  for (const message of messages) {
    if (message.role === "user") {
      add("user", [{ type: "text", text: userText(message) }]);
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
          const { status, output } = projectToolOutput(part.output);
          target.tool.status = status;
          target.tool.output = output;
        }
      }
    }
  }
  return chat;
}
