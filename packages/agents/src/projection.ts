import {
  getAssistantGenerationMetadata,
  type AgentStreamEvent,
  type AssistantContentPart,
  type Message,
  type ToolCallPart,
  type ToolResultOutput,
  type Usage,
} from "@anvia/core";

import {
  addUsage,
  messageId,
  NO_USAGE,
  QUESTION_TOOL_NAME,
  SECRET_TOOL_NAME,
  SHOW_IMAGE_TOOL_NAME,
  type ChatMessage,
  type ContextUsage,
  type DiffLine,
  type MessagePart,
  type QuestionPrompt,
  type RunEvent,
  type ThreadUsage,
  type TokenUsage,
  type ToolImage,
  type ToolPart,
} from "@aven/protocol/events";

import { sentMessage } from "./attachments";
import type { SandboxToolName } from "./sandbox-tools";
import { DEFINE_GOAL_TOOL_NAME } from "./tools/define-goal";
import { EDIT_TOOL_NAME } from "./tools/edit";
import { GIT_FETCH_TOOL_NAME } from "./tools/git-fetch";
import { SAVE_ENVIRONMENT_TOOL_NAME } from "./tools/save-environment";
import { WEB_SEARCH_TOOL_NAME } from "./tools/web-search";
import { asRecord } from "./values";

// What a client is sent of a tool result; the model sees the full output.
const MAX_UI_OUTPUT_CHARS = 4000;
const MAX_DIFF_LINES = 60;

const asString = (value: unknown) => (typeof value === "string" ? value : "");

// The sandbox's tools (from @anvia/sandbox) and what each one acts on, for the line a client shows.
const PATH_TOOLS = new Set<string>([
  "read_file",
  "write_file",
  "list_files",
  EDIT_TOOL_NAME,
  SHOW_IMAGE_TOOL_NAME,
] satisfies (SandboxToolName | typeof EDIT_TOOL_NAME | typeof SHOW_IMAGE_TOOL_NAME)[]);
const COMMAND_TOOLS = new Set<string>([
  "exec_command",
  "start_process",
] satisfies SandboxToolName[]);
const PROCESS_TOOLS = new Set<string>([
  "read_process_logs",
  "stop_process",
] satisfies SandboxToolName[]);
const PORT_TOOL: SandboxToolName = "wait_for_port";
// Tools whose JSON result carries a `summary` meant to be read as it is.
const SUMMARISED_TOOLS = new Set<string>([GIT_FETCH_TOOL_NAME, SAVE_ENVIRONMENT_TOOL_NAME]);

export function toolTarget(name: string, input: unknown) {
  const args = asRecord(input);
  if (PATH_TOOLS.has(name)) return asString(args.path);
  if (COMMAND_TOOLS.has(name)) return asString(args.command);
  if (PROCESS_TOOLS.has(name)) return asString(args.processId);
  if (name === WEB_SEARCH_TOOL_NAME) return asString(args.query);
  if (name === DEFINE_GOAL_TOOL_NAME) return asString(args.objective);
  if (name === GIT_FETCH_TOOL_NAME) return asString(args.branch) || "default branch";
  if (name === PORT_TOOL) return String(args.containerPort ?? "");
  return "";
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

// The questions of an `ask_user` call, as the model wrote them. Anything malformed is left out.
function questionsOf(input: unknown): QuestionPrompt[] {
  const { questions } = asRecord(input);
  if (!Array.isArray(questions)) return [];
  return questions.flatMap((entry): QuestionPrompt[] => {
    const question = asRecord(entry);
    if (typeof question.id !== "string" || typeof question.text !== "string") return [];
    const choices = Array.isArray(question.choices)
      ? question.choices.flatMap((choice) => {
          const { label, value } = asRecord(choice);
          return typeof label === "string" && typeof value === "string" ? [{ label, value }] : [];
        })
      : undefined;
    const prompt: QuestionPrompt = { id: question.id, text: question.text };
    if (choices?.length) prompt.choices = choices;
    if (question.allowCustom === true) prompt.allowCustom = true;
    return [prompt];
  });
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
  if (call.toolName === QUESTION_TOOL_NAME || call.toolName === SECRET_TOOL_NAME) {
    tool.questions = questionsOf(call.input);
  }
  return tool;
}

function clip(text: string) {
  return text.length > MAX_UI_OUTPUT_CHARS
    ? `${text.slice(0, MAX_UI_OUTPUT_CHARS)}\n… [truncated]`
    : text;
}

// The text a human would read from a tool's structured result; anything unfamiliar is shown as JSON.
function jsonText(value: unknown) {
  const result = asRecord(value);
  if (result.status === "exited" || result.status === "timed_out") return commandText(result);
  if (typeof result.content === "string") return result.content;
  if (typeof result.bytesWritten === "number") {
    return `Wrote ${result.bytesWritten} bytes to ${asString(result.path)}`;
  }
  if (Array.isArray(result.entries)) {
    return result.entries
      .map((entry) => `${asString(asRecord(entry).type)}\t${asString(asRecord(entry).path)}`)
      .join("\n");
  }
  return JSON.stringify(value);
}

// The image a result of the image tool carries, when it has one of the right shape. Only that
// tool's result is read this way: another tool's JSON may have an `image` of its own.
function imageOf(value: unknown): ToolImage | undefined {
  const { name, mediaType, caption } = asRecord(asRecord(value).image);
  if (typeof name !== "string" || typeof mediaType !== "string") return undefined;
  return typeof caption === "string" ? { name, mediaType, caption } : { name, mediaType };
}

function commandText(result: Record<string, unknown>) {
  const parts = [asString(result.stdout), asString(result.stderr)].filter(Boolean);
  if (result.status === "timed_out") parts.push("[timed out]");
  else if (result.exitCode !== 0) parts.push(`[exit ${String(result.exitCode)}]`);
  return parts.join("\n");
}

// What the UI shows for a tool result: the text a human would read, never the raw payload.
export function projectToolOutput(
  output: ToolResultOutput,
  toolName?: string,
): {
  status: "done" | "error";
  output: string;
  image?: ToolImage;
} {
  switch (output.type) {
    case "text":
      return { status: "done", output: clip(output.value) };
    case "error-text":
      return { status: "error", output: clip(output.value) };
    case "json": {
      const image = toolName === SHOW_IMAGE_TOOL_NAME ? imageOf(output.value) : undefined;
      if (image) {
        return { status: "done", output: `Showed ${asString(asRecord(output.value).path)}`, image };
      }
      // What these tools did, in the words they gave it.
      const said =
        toolName && SUMMARISED_TOOLS.has(toolName) ? asString(asRecord(output.value).summary) : "";
      return { status: "done", output: clip(said || jsonText(output.value)) };
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

/** The end of a tool call as a client sees it: how it went and what it said. */
export function projectToolEnd(
  id: string,
  output: ToolResultOutput,
  toolName?: string,
): Extract<RunEvent, { type: "tool_end" }> {
  return { type: "tool_end", id, ...projectToolOutput(output, toolName) };
}

function assertNever(value: never): never {
  throw new Error(`Unhandled tool result: ${JSON.stringify(value)}`);
}

// Core's `inputTokens` already includes what was written to and read from the cache.
export function tokenUsageOf(usage: Usage): TokenUsage {
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cacheWriteTokens: usage.cacheCreationInputTokens,
    cacheReadTokens: usage.cachedInputTokens,
  };
}

// How much of the model's context a request used, as Anvia reports it.
type ModelContextUsage = {
  usedTokens: number;
  model: { context: { contextWindow: number } };
};

// Only known when the model's context window is.
const contextOf = (usage: ModelContextUsage | undefined): ContextUsage | undefined =>
  usage && { usedTokens: usage.usedTokens, contextWindow: usage.model.context.contextWindow };

// What a thread has used, read back from the generation metadata stored with its messages.
export function usageFromHistory(messages: readonly Message[]): ThreadUsage {
  let totals = NO_USAGE;
  let context: ContextUsage | undefined;
  for (const message of messages) {
    const generation = getAssistantGenerationMetadata(message);
    if (!generation) continue;
    totals = addUsage(totals, tokenUsageOf(generation.usage));
    context = contextOf(generation.contextUsage) ?? context;
  }
  return { totals, context };
}

// Only these run events ever reach a client. Turn events carry full history and the system prompt,
// and reasoning/provider payloads are private, so they are dropped here.
export function projectStreamEvent(event: AgentStreamEvent): RunEvent | undefined {
  switch (event.type) {
    case "text_delta":
      return { type: "text", delta: event.delta };
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

function assistantParts(content: string | readonly AssistantContentPart[]): MessagePart[] {
  // Blank text is left out, as the reducer does with a blank delta: it would split tool calls.
  if (typeof content === "string") return content.trim() ? [{ type: "text", text: content }] : [];
  const parts: MessagePart[] = [];
  for (const part of content) {
    if (part.type === "text" && part.text.trim()) parts.push({ type: "text", text: part.text });
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
          const { status, output, image } = projectToolOutput(part.output, target.tool.name);
          target.tool.status = status;
          target.tool.output = output;
          if (image) target.tool.image = image;
        }
      }
    }
  }
  return chat;
}
