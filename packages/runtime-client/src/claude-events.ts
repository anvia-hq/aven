import type { Message, ToolCallPart } from "@anvia/core";
import { projectToolCall, toolTarget } from "@aven/agents/tool-projection";
import {
  QUESTION_TOOL_NAME,
  SECRET_TOOL_NAME,
  SHOW_ARTIFACT_TOOL_NAME,
} from "@aven/protocol/events";

import type { ClaudeSdkMessage, ClaudeUsage } from "./types";
import type {
  QuestionPrompt,
  RunEvent,
  TokenUsage,
  ToolArtifact,
  ToolPart,
} from "@aven/protocol/types";

const MAX_OUTPUT = 8_000;

const STOPPED: Record<string, string> = {
  error_max_turns: "The run used all of its turns",
  error_max_budget_usd: "The run reached its spending limit",
  error_during_execution: "The run stopped while a tool was running",
};

const MCP_PREFIX = "mcp__aven__";

type Part = Record<string, unknown>;

const clip = (text: string) =>
  text.length > MAX_OUTPUT ? `${text.slice(0, MAX_OUTPUT)}\n…` : text;

function recordOf(value: unknown): Part {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) return value as Part;

  return {};
}

function blocksOf(content: unknown): Part[] {
  if (!Array.isArray(content)) return [];

  return content.filter((block): block is Part => typeof block === "object" && block !== null);
}

function resultText(content: unknown) {
  if (typeof content === "string") return content;

  return blocksOf(content)
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .filter((text) => text.length > 0)
    .join("\n");
}

function shownName(name: string) {
  return name.startsWith(MCP_PREFIX) ? name.slice(MCP_PREFIX.length) : name;
}

function targetOf(name: string, input: unknown) {
  const args = recordOf(input);

  if (typeof args.command === "string" && args.command) return args.command;

  if (typeof args.path === "string" && args.path) return args.path;

  if (typeof args.file_path === "string" && args.file_path) return args.file_path;

  const shown = toolTarget(shownName(name), input);

  if (shown) return shown;

  const items = args.items;
  const first = Array.isArray(items) ? recordOf(items[0]) : {};
  return typeof first.path === "string" ? first.path : "";
}

function jsonValue(value: unknown) {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  try {
    return structuredClone(value ?? null);
  } catch {
    return String(value);
  }
}

function usageOf(usage: ClaudeUsage | undefined): TokenUsage | undefined {
  if (!usage || typeof usage.input_tokens !== "number") return undefined;

  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens ?? 0,
    cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
  };
}

export class ClaudeTurn {
  sessionId?: string;
  error?: string;
  #streamedText = false;
  #streamedThinking = false;
  #announced = new Set<string>();
  #names = new Map<string, string>();
  #sawText = false;
  #usageSent = false;
  #assistant: Part[] = [];
  #tools: Part[] = [];
  #filed: Message[] = [];
  #open = new Map<string, string>();
  #alias = new Map<string, string>();
  #shown: ToolArtifact[][] = [];

  constructor(private readonly redact: (text: string) => string = (text) => text) {}

  take(message: ClaudeSdkMessage): RunEvent[] {
    this.#remember(message.session_id);

    if (message.type === "system") return [];

    if (message.type === "stream_event") return this.#delta(message);

    if (message.type === "assistant") return this.#assistantMessage(message);

    if (message.type === "user") return this.#toolResults(message);

    if (message.type === "result") return this.#result(message);

    return [];
  }

  queueArtifacts(artifacts: ToolArtifact[]) {
    this.#shown.push(artifacts);
  }

  openQuestion(name: string) {
    for (const [id, tool] of this.#open) if (tool === name) return id;
    return undefined;
  }

  ensureQuestion(id: string, name: string, questions: QuestionPrompt[]): RunEvent | undefined {
    if (this.#announced.has(id)) return undefined;

    this.#announced.add(id);
    this.#names.set(id, name);
    this.#open.set(id, name);
    const input = { questions };
    this.#pushCall(id, name, input);
    return { type: "tool_start", tool: this.#toolPart(id, name, input) };
  }

  release(prompt: string): Message[] {
    const messages = this.messages(prompt);
    this.#filed = [];
    this.#assistant = [];
    this.#tools = [];
    this.#streamedText = false;
    this.#streamedThinking = false;
    this.#sawText = false;
    this.#usageSent = false;
    return messages;
  }

  messages(prompt: string): Message[] {
    const filed = [...this.#filed];

    if (this.#assistant.length > 0) filed.push(this.#assistantMessageOf(this.#assistant));

    if (this.#tools.length > 0) filed.push(this.#toolMessageOf(this.#tools));

    const text = this.redact(prompt).trim();
    return text ? [{ role: "user", content: text }, ...filed] : filed;
  }

  #remember(sessionId: string | undefined) {
    if (sessionId) this.sessionId = sessionId;
  }

  #fail(message: string) {
    if (!this.error) this.error = clip(this.redact(message));
  }

  #delta(message: Extract<ClaudeSdkMessage, { type: "stream_event" }>): RunEvent[] {
    const event = message.event;
    const delta = event?.delta;

    if (event?.type !== "content_block_delta" || !delta) return [];

    if (delta.type === "text_delta" && delta.text) {
      const text = this.redact(delta.text);
      this.#streamedText = true;
      this.#sawText = true;
      this.#pushText(text);
      return [{ type: "text", delta: text }];
    }

    if (delta.type === "thinking_delta" && delta.thinking) {
      const text = this.redact(delta.thinking);
      this.#streamedThinking = true;
      this.#pushReasoning(text);
      return [{ type: "reasoning", delta: text }];
    }

    return [];
  }

  #assistantMessage(message: Extract<ClaudeSdkMessage, { type: "assistant" }>): RunEvent[] {
    if (message.error === "authentication_failed") {
      this.error = "The Claude setup token was rejected. Replace it in Settings.";
    } else if (message.error) {
      this.#fail(message.error);
    }

    const events: RunEvent[] = [];
    for (const block of blocksOf(message.message?.content)) {
      if (block.type === "text" && typeof block.text === "string") {
        if (this.#streamedText) continue;

        const text = this.redact(block.text);

        if (!text) continue;

        this.#sawText = true;
        this.#pushText(text);
        events.push({ type: "text", delta: text });
      } else if (block.type === "thinking" && typeof block.thinking === "string") {
        if (this.#streamedThinking) continue;

        const text = this.redact(block.thinking);

        if (!text) continue;

        this.#pushReasoning(text);
        events.push({ type: "reasoning", delta: text });
      } else if (block.type === "tool_use" && typeof block.name === "string") {
        const id =
          typeof block.id === "string" && block.id ? block.id : `tool-${this.#announced.size}`;

        if (this.#announced.has(id)) continue;

        const name = shownName(block.name);
        const pending = this.openQuestion(name);

        if (
          pending &&
          pending !== id &&
          (name === QUESTION_TOOL_NAME || name === SECRET_TOOL_NAME)
        ) {
          this.#alias.set(id, pending);
          this.#names.set(id, name);
          continue;
        }

        if (this.#announced.has(id)) continue;

        this.#announced.add(id);
        this.#names.set(id, name);
        this.#open.set(id, name);
        this.#pushCall(id, name, block.input);
        events.push({ type: "tool_start", tool: this.#toolPart(id, name, block.input) });
      }
    }
    this.#streamedText = false;
    this.#streamedThinking = false;
    return events;
  }

  #toolResults(message: Extract<ClaudeSdkMessage, { type: "user" }>): RunEvent[] {
    const events: RunEvent[] = [];
    for (const block of blocksOf(message.message?.content)) {
      if (block.type !== "tool_result" || typeof block.tool_use_id !== "string") continue;

      const output = clip(this.redact(resultText(block.content)));
      const failed = block.is_error === true;
      const id = this.#alias.get(block.tool_use_id) ?? block.tool_use_id;
      this.#open.delete(id);
      this.#pushTool(id, output, failed);
      const name = this.#names.get(id) ?? this.#names.get(block.tool_use_id);
      const event: Extract<RunEvent, { type: "tool_end" }> = {
        type: "tool_end",
        id,
        status: failed ? "error" : "done",
        output,
      };

      if (name === SHOW_ARTIFACT_TOOL_NAME) {
        const artifacts = this.#shown.shift();

        if (artifacts?.length) event.artifacts = artifacts;
      }

      events.push(event);
    }
    return events;
  }

  #result(message: Extract<ClaudeSdkMessage, { type: "result" }>): RunEvent[] {
    const events: RunEvent[] = [];
    const usage = usageOf(message.usage);

    if (usage && !this.#usageSent) {
      this.#usageSent = true;
      events.push({ type: "usage", turn: usage });
    }

    if (message.subtype && message.subtype !== "success") {
      const detail = (message.errors ?? []).filter((item) => item.length > 0).join(" ");
      let reason = STOPPED[message.subtype] ?? `The Claude agent stopped (${message.subtype})`;

      if (detail) reason = detail;
      else if (message.result) reason = message.result;

      this.#fail(reason);
    } else if (message.result && !this.#sawText) {
      const text = this.redact(message.result);

      if (text) {
        this.#sawText = true;
        this.#pushText(text);
        events.push({ type: "text", delta: text });
      }
    }

    return events;
  }

  #pushText(text: string) {
    if (!text) return;

    this.#flushTools();
    const last = this.#assistant.at(-1);

    if (last?.type === "text" && typeof last.text === "string") {
      this.#assistant[this.#assistant.length - 1] = { type: "text", text: last.text + text };
      return;
    }

    this.#assistant.push({ type: "text", text });
  }

  #pushReasoning(text: string) {
    if (!text) return;

    this.#flushTools();
    const last = this.#assistant.at(-1);

    if (last?.type === "reasoning" && typeof last.text === "string") {
      this.#assistant[this.#assistant.length - 1] = { type: "reasoning", text: last.text + text };
      return;
    }

    this.#assistant.push({ type: "reasoning", text });
  }

  #toolPart(id: string, name: string, input: unknown): ToolPart {
    const tool: ToolPart = {
      id,
      name,
      target: targetOf(name, input),
      status: "running",
    };

    if (name === QUESTION_TOOL_NAME || name === SECRET_TOOL_NAME) {
      const projected = projectToolCall({
        type: "tool-call",
        toolCallId: id,
        toolName: name,
        input: jsonValue(input) as ToolCallPart["input"],
      });

      if (projected.questions?.length) tool.questions = projected.questions;
    }

    return tool;
  }

  #pushCall(id: string, name: string, input: unknown) {
    this.#flushTools();
    this.#assistant.push({
      type: "tool-call",
      toolCallId: id,
      toolName: name,
      input: jsonValue(input),
    });
  }

  #pushTool(id: string, output: string, failed: boolean) {
    this.#flushAssistant();
    this.#tools.push({
      type: "tool-result",
      toolCallId: id,
      toolName: this.#names.get(id) ?? "tool",
      output: failed ? { type: "error-text", value: output } : { type: "text", value: output },
    });
  }

  #flushAssistant() {
    if (this.#assistant.length === 0) return;

    this.#filed.push(this.#assistantMessageOf(this.#assistant));
    this.#assistant = [];
  }

  #flushTools() {
    if (this.#tools.length === 0) return;

    this.#filed.push(this.#toolMessageOf(this.#tools));
    this.#tools = [];
  }

  #assistantMessageOf(content: Part[]): Message {
    return { role: "assistant", content } as unknown as Message;
  }

  #toolMessageOf(content: Part[]): Message {
    return { role: "tool", content } as unknown as Message;
  }
}
