import type { Message, ToolCallPart } from "@anvia/core";
import { projectToolCall, toolTarget } from "@aven/agents/tool-projection";
import { codexContextOf, codexResolvedOf } from "@aven/protocol/codex-models";
import {
  QUESTION_TOOL_NAME,
  SECRET_TOOL_NAME,
  SHOW_ARTIFACT_TOOL_NAME,
} from "@aven/protocol/events";

import type { CodexSdkEvent, CodexSdkItem, CodexUsage } from "@aven/agent-backend/types";
import type {
  ContextUsage,
  QuestionPrompt,
  RunEvent,
  TokenUsage,
  ToolArtifact,
  ToolPart,
} from "@aven/protocol/types";

const MAX_OUTPUT = 8_000;

const AUTH_FAILURE = "The Codex API key was rejected. Replace it in Settings.";

type Part = Record<string, unknown>;

type Generation = { usage: TokenUsage; context?: ContextUsage };

function generationMetadata(modelId: string, { usage, context }: Generation) {
  const generation: Record<string, unknown> = {
    provider: "openai",
    modelId,
    usage: {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.inputTokens + usage.outputTokens,
      cachedInputTokens: usage.cacheReadTokens,
      cacheCreationInputTokens: usage.cacheWriteTokens,
    },
  };

  if (context?.contextWindow && context.contextWindow > 0) {
    const remainingTokens = Math.max(0, context.contextWindow - context.usedTokens);
    generation.contextUsage = {
      model: { modelId, context: { contextWindow: context.contextWindow } },
      usedTokens: context.usedTokens,
      remainingTokens,
      usedPercent: Math.min(100, (context.usedTokens / context.contextWindow) * 100),
      remainingPercent: (remainingTokens / context.contextWindow) * 100,
    };
  }

  return { anvia: { generation } };
}

function lastAssistantIndex(messages: readonly Message[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "assistant") return index;
  }

  return -1;
}

const clip = (text: string) =>
  text.length > MAX_OUTPUT ? `${text.slice(0, MAX_OUTPUT)}\n…` : text;

function messageOf(message: Part): Message {
  return message as Message;
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

function usageOf(usage: CodexUsage): TokenUsage {
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheWriteTokens: usage.cache_write_input_tokens ?? 0,
    cacheReadTokens: usage.cached_input_tokens,
  };
}

function rejectedKey(message: string) {
  const lower = message.toLowerCase();
  return (
    lower.includes("401") ||
    lower.includes("incorrect api key") ||
    lower.includes("invalid api key") ||
    lower.includes("unauthorized")
  );
}

function resultText(item: Extract<CodexSdkItem, { type: "mcp_tool_call" }>) {
  if (item.error?.message) return item.error.message;

  return (item.result?.content ?? [])
    .flatMap((part) => (typeof part.text === "string" && part.text.length > 0 ? [part.text] : []))
    .join("\n");
}

export class CodexTurn {
  sessionId?: string;
  error?: string;
  #modelId: string;
  #contextWindow: number;
  #announced = new Set<string>();
  #names = new Map<string, string>();
  #generation: Generation | undefined;
  #assistant: Part[] = [];
  #tools: Part[] = [];
  #filed: Message[] = [];
  #open = new Map<string, string>();
  #alias = new Map<string, string>();
  #seen = new Map<string, string>();
  #shown: ToolArtifact[][] = [];

  constructor(
    model: string | undefined,
    private readonly redact: (text: string) => string = (text) => text,
  ) {
    this.#modelId = codexResolvedOf(model);
    this.#contextWindow = codexContextOf(model);
  }

  take(event: CodexSdkEvent): RunEvent[] {
    if (event.type === "thread.started") {
      this.sessionId = event.thread_id;
      return [];
    }

    if (event.type === "turn.started") return [];

    if (event.type === "turn.completed") return this.#usage(event.usage);

    if (event.type === "turn.failed") {
      this.#fail(event.error.message);
      return [];
    }

    if (event.type === "error") {
      this.#fail(event.message);
      return [];
    }

    if (event.type === "item.updated") return this.#updated(event.item);

    if (event.type === "item.started") return this.#started(event.item);

    if (event.type === "item.completed") return this.#completed(event.item);

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
    this.#generation = undefined;
    return messages;
  }

  messages(prompt: string): Message[] {
    const filed = [...this.#filed];

    if (this.#assistant.length > 0) filed.push(this.#assistantMessageOf(this.#assistant));

    if (this.#tools.length > 0) filed.push(this.#toolMessageOf(this.#tools));

    const stamped = this.#stamped(filed);
    const text = this.redact(prompt).trim();
    return text ? [{ role: "user", content: text }, ...stamped] : stamped;
  }

  #stamped(filed: Message[]): Message[] {
    const index = this.#generation ? lastAssistantIndex(filed) : -1;
    const message = filed[index];

    if (!this.#generation || !message) return filed;

    const stamped = [...filed];
    stamped[index] = {
      ...message,
      metadata: generationMetadata(this.#modelId, this.#generation),
    } as Message;
    return stamped;
  }

  #fail(message: string) {
    if (rejectedKey(message)) {
      this.error = AUTH_FAILURE;
      return;
    }

    if (!this.error) this.error = clip(this.redact(message));
  }

  #delta(id: string, text: string, kind: "text" | "reasoning"): RunEvent[] {
    const previous = this.#seen.get(id) ?? "";
    const next = text.startsWith(previous) ? text.slice(previous.length) : text;
    this.#seen.set(id, text);

    if (!next) return [];

    const redacted = this.redact(next);

    if (!redacted) return [];

    if (kind === "reasoning") {
      this.#pushReasoning(redacted);
      return [{ type: "reasoning", delta: redacted }];
    }

    this.#pushText(redacted);
    return [{ type: "text", delta: redacted }];
  }

  #updated(item: CodexSdkItem): RunEvent[] {
    if (item.type === "agent_message") return this.#delta(item.id, item.text, "text");

    if (item.type === "reasoning") return this.#delta(item.id, item.text, "reasoning");

    return [];
  }

  #started(item: CodexSdkItem): RunEvent[] {
    if (item.type === "agent_message" && item.text) return this.#delta(item.id, item.text, "text");

    if (item.type === "reasoning" && item.text) return this.#delta(item.id, item.text, "reasoning");

    if (item.type === "command_execution") {
      return this.#begin(item.id, "exec_command", item.command, { command: item.command });
    }

    if (item.type === "mcp_tool_call") return this.#beginMcp(item);

    if (item.type === "web_search") {
      return this.#begin(item.id, "web_search", item.query, { query: item.query });
    }

    return [];
  }

  #completed(item: CodexSdkItem): RunEvent[] {
    if (item.type === "agent_message") return this.#delta(item.id, item.text, "text");

    if (item.type === "reasoning") return this.#delta(item.id, item.text, "reasoning");

    if (item.type === "command_execution") {
      const events = this.#ensure(item.id, "exec_command", item.command, { command: item.command });
      const failed =
        item.status === "failed" || (item.exit_code !== undefined && item.exit_code !== 0);
      events.push(...this.#finish(item.id, clip(this.redact(item.aggregated_output)), failed));
      return events;
    }

    if (item.type === "file_change") {
      const target = item.changes[0]?.path ?? "";
      const events = this.#ensure(item.id, "apply_patch", target, { changes: item.changes });
      const output = item.changes.map((change) => `${change.kind} ${change.path}`).join("\n");
      events.push(...this.#finish(item.id, output, item.status === "failed"));
      return events;
    }

    if (item.type === "mcp_tool_call") {
      const events = this.#beginMcp(item);
      const failed = item.status === "failed" || Boolean(item.error);
      events.push(...this.#finish(item.id, clip(this.redact(resultText(item))), failed));
      return events;
    }

    if (item.type === "web_search") {
      const events = this.#ensure(item.id, "web_search", item.query, { query: item.query });
      events.push(...this.#finish(item.id, item.query, false));
      return events;
    }

    if (item.type === "todo_list") {
      const output = item.items
        .map((todo) => `${todo.completed ? "x" : " "} ${todo.text}`)
        .join("\n");
      const events = this.#ensure(item.id, "todo", "", { items: item.items });
      events.push(...this.#finish(item.id, output, false));
      return events;
    }

    if (item.type === "error") {
      this.#fail(item.message);
      return [];
    }

    return [];
  }

  #usage(usage: CodexUsage): RunEvent[] {
    const turn = usageOf(usage);
    const contextWindow = this.#contextWindow;
    const usedTokens = turn.inputTokens + turn.outputTokens;
    const context: ContextUsage | undefined =
      usedTokens > 0 ? { usedTokens, contextWindow } : undefined;
    this.#generation = this.#generation
      ? {
          usage: {
            inputTokens: this.#generation.usage.inputTokens + turn.inputTokens,
            outputTokens: this.#generation.usage.outputTokens + turn.outputTokens,
            cacheWriteTokens: this.#generation.usage.cacheWriteTokens + turn.cacheWriteTokens,
            cacheReadTokens: this.#generation.usage.cacheReadTokens + turn.cacheReadTokens,
          },
          context: context ?? this.#generation.context,
        }
      : { usage: turn, context };
    return context ? [{ type: "usage", turn, context }] : [{ type: "usage", turn }];
  }

  #beginMcp(item: Extract<CodexSdkItem, { type: "mcp_tool_call" }>): RunEvent[] {
    const name = item.tool;
    const pending = this.openQuestion(name);

    if (
      pending &&
      pending !== item.id &&
      (name === QUESTION_TOOL_NAME || name === SECRET_TOOL_NAME)
    ) {
      this.#alias.set(item.id, pending);
      this.#names.set(item.id, name);
      return [];
    }

    const target = toolTarget(name, item.arguments) ?? "";
    return this.#begin(item.id, name, target, item.arguments);
  }

  #ensure(id: string, name: string, target: string, input: unknown): RunEvent[] {
    if (this.#announced.has(id) || this.#alias.has(id)) return [];

    return this.#begin(id, name, target, input);
  }

  #begin(id: string, name: string, target: string, input: unknown): RunEvent[] {
    if (this.#announced.has(id)) return [];

    this.#announced.add(id);
    this.#names.set(id, name);
    this.#open.set(id, name);
    this.#pushCall(id, name, input);
    const tool = this.#toolPart(id, name, input);

    if (target) tool.target = target;

    return [{ type: "tool_start", tool }];
  }

  #finish(id: string, output: string, failed: boolean): RunEvent[] {
    const aliased = this.#alias.get(id) ?? id;
    this.#open.delete(aliased);
    this.#pushTool(aliased, output, failed);
    const name = this.#names.get(aliased) ?? this.#names.get(id);
    const event: Extract<RunEvent, { type: "tool_end" }> = {
      type: "tool_end",
      id: aliased,
      status: failed ? "error" : "done",
      output,
    };

    if (name === SHOW_ARTIFACT_TOOL_NAME) {
      const artifacts = this.#shown.shift();

      if (artifacts?.length) event.artifacts = artifacts;
    }

    return [event];
  }

  #toolPart(id: string, name: string, input: unknown): ToolPart {
    const tool: ToolPart = {
      id,
      name,
      target: toolTarget(name, input) ?? "",
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
    return messageOf({ role: "assistant", content });
  }

  #toolMessageOf(content: Part[]): Message {
    return messageOf({ role: "tool", content });
  }
}
