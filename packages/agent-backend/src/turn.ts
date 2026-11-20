import type { Message, ToolCallPart } from "@anvia/core";
import { projectToolCall, toolTarget } from "@aven/agents/tool-projection";
import {
  QUESTION_TOOL_NAME,
  SECRET_TOOL_NAME,
  SHOW_ARTIFACT_TOOL_NAME,
} from "@aven/protocol/events";
import type {
  ContextUsage,
  QuestionPrompt,
  RunEvent,
  TokenUsage,
  ToolArtifact,
  ToolPart,
} from "@aven/protocol/types";

import type { TurnRecorderOptions } from "./types";

const MAX_OUTPUT = 8_000;

type Part = Record<string, unknown>;

type Generation = { usage: TokenUsage; context?: ContextUsage };

function clip(text: string) {
  return text.length > MAX_OUTPUT ? `${text.slice(0, MAX_OUTPUT)}\n…` : text;
}

function messageOf(message: Part): Message {
  return message as Message;
}

function lastAssistantIndex(messages: readonly Message[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "assistant") return index;
  }

  return -1;
}

function generationMetadata(provider: string, modelId: string, { usage, context }: Generation) {
  const generation: Record<string, unknown> = {
    provider,
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

function redactJson(
  value: unknown,
  redact: (text: string) => string,
  seen = new WeakSet<object>(),
): unknown {
  if (typeof value === "string") return redact(value);

  if (value === null || typeof value === "number" || typeof value === "boolean") return value;

  if (value === undefined) return null;

  if (typeof value !== "object") return redact(String(value));

  if (seen.has(value)) return null;

  seen.add(value);

  if (Array.isArray(value)) return value.map((item) => redactJson(item, redact, seen));

  try {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = redactJson(item, redact, seen);
    }
    return out;
  } catch {
    return redact(String(value));
  }
}

export class TurnRecorder {
  sessionId?: string;
  error?: string;
  readonly #provider: string;
  readonly #modelId: string;
  readonly #redact: (text: string) => string;
  #announced = new Set<string>();
  #names = new Map<string, string>();
  #generation: Generation | undefined;
  #assistant: Part[] = [];
  #tools: Part[] = [];
  #filed: Message[] = [];
  #open = new Map<string, string>();
  #alias = new Map<string, string>();
  #shown: ToolArtifact[][] = [];

  constructor(options: TurnRecorderOptions) {
    this.#provider = options.provider;
    this.#modelId = options.modelId;
    this.#redact = options.redact ?? ((text) => text);
  }

  redactText(text: string) {
    return this.#redact(text);
  }

  fail(message: string) {
    if (!this.error) this.error = clip(this.#redact(message));
  }

  setError(message: string) {
    this.error = message;
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

  hasAnnounced(id: string) {
    return this.#announced.has(id);
  }

  hasAlias(id: string) {
    return this.#alias.has(id);
  }

  announcedCount() {
    return this.#announced.size;
  }

  aliasQuestion(id: string, name: string): boolean {
    if (name !== QUESTION_TOOL_NAME && name !== SECRET_TOOL_NAME) return false;

    const pending = this.openQuestion(name);

    if (!pending || pending === id) return false;

    this.#alias.set(id, pending);
    this.#names.set(id, name);
    return true;
  }

  resetTurnItems() {
    for (const id of this.#announced) {
      if (!this.#open.has(id)) this.#announced.delete(id);
    }
    for (const [aliasId, targetId] of this.#alias) {
      if (!this.#open.has(targetId)) this.#alias.delete(aliasId);
    }
  }

  beginTool(id: string, name: string, input: unknown, target?: string): RunEvent[] {
    if (this.#announced.has(id)) return [];

    this.#announced.add(id);
    this.#names.set(id, name);
    this.#open.set(id, name);
    this.#pushCall(id, name, input);
    return [{ type: "tool_start", tool: this.#toolPart(id, name, input, target) }];
  }

  ensureTool(id: string, name: string, input: unknown, target?: string): RunEvent[] {
    if (this.#announced.has(id) || this.#alias.has(id)) return [];

    return this.beginTool(id, name, input, target);
  }

  finishTool(id: string, rawOutput: string, failed: boolean): RunEvent[] {
    const output = clip(this.#redact(rawOutput));
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

  pushText(rawText: string): RunEvent[] {
    const text = this.#redact(rawText);

    if (!text) return [];

    this.#flushTools();
    const last = this.#assistant.at(-1);

    if (last?.type === "text" && typeof last.text === "string") {
      this.#assistant[this.#assistant.length - 1] = { type: "text", text: last.text + text };
    } else {
      this.#assistant.push({ type: "text", text });
    }

    return [{ type: "text", delta: text }];
  }

  pushReasoning(rawText: string): RunEvent[] {
    const text = this.#redact(rawText);

    if (!text) return [];

    this.#flushTools();
    const last = this.#assistant.at(-1);

    if (last?.type === "reasoning" && typeof last.text === "string") {
      this.#assistant[this.#assistant.length - 1] = { type: "reasoning", text: last.text + text };
    } else {
      this.#assistant.push({ type: "reasoning", text });
    }

    return [{ type: "reasoning", delta: text }];
  }

  recordUsage(turn: TokenUsage, context?: ContextUsage): RunEvent {
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
    return context ? { type: "usage", turn, context } : { type: "usage", turn };
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

    if (this.#assistant.length > 0)
      filed.push(messageOf({ role: "assistant", content: this.#assistant }));

    if (this.#tools.length > 0) filed.push(messageOf({ role: "tool", content: this.#tools }));

    const stamped = this.#stamped(filed);
    const text = this.#redact(prompt).trim();
    return text ? [{ role: "user", content: text }, ...stamped] : stamped;
  }

  #stamped(filed: Message[]): Message[] {
    const index = this.#generation ? lastAssistantIndex(filed) : -1;
    const message = filed[index];

    if (!this.#generation || !message) return filed;

    const stamped = [...filed];
    stamped[index] = {
      ...message,
      metadata: generationMetadata(this.#provider, this.#modelId, this.#generation),
    } as Message;
    return stamped;
  }

  #toolPart(id: string, name: string, input: unknown, target?: string): ToolPart {
    const redactedInput = redactJson(input, this.#redact);
    const rawTarget =
      target && target.length > 0 ? target : (toolTarget(name, redactedInput) ?? "");
    const tool: ToolPart = {
      id,
      name,
      target: this.#redact(rawTarget),
      status: "running",
    };

    if (name === QUESTION_TOOL_NAME || name === SECRET_TOOL_NAME) {
      const projected = projectToolCall({
        type: "tool-call",
        toolCallId: id,
        toolName: name,
        input: redactedInput as ToolCallPart["input"],
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
      input: redactJson(input, this.#redact),
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

    this.#filed.push(messageOf({ role: "assistant", content: this.#assistant }));
    this.#assistant = [];
  }

  #flushTools() {
    if (this.#tools.length === 0) return;

    this.#filed.push(messageOf({ role: "tool", content: this.#tools }));
    this.#tools = [];
  }
}
