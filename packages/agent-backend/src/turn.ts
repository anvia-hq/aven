import type { Message, ToolCallPart, ToolResultOutput } from "@anvia/core";
import { projectToolCall, projectToolOutput, toolTarget } from "@aven/agents/tool-projection";
import { withToolUiMetadata } from "@aven/agents/tool-ui";
import { isPlainObject } from "@aven/agents/values";
import type { ToolUiEntry } from "@aven/agents/types";
import {
  addUsage,
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

import { STEER_NOTE } from "./hosted-helpers";
import type { TurnRecorderOptions } from "./types";

const MAX_OUTPUT = 8_000;

type Part = Record<string, unknown>;

type JsonValue = Extract<ToolResultOutput, { type: "json" }>["value"];

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
): JsonValue {
  if (typeof value === "string") return redact(value);

  if (value === null || typeof value === "number" || typeof value === "boolean") return value;

  if (value === undefined) return null;

  if (typeof value !== "object") return redact(String(value));

  if (seen.has(value)) return null;

  seen.add(value);

  if (Array.isArray(value)) return value.map((item) => redactJson(item, redact, seen));

  try {
    const out: Record<string, JsonValue> = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = redactJson(item, redact, seen);
    }
    return out;
  } catch {
    return redact(String(value));
  }
}

const STEER_SEPARATOR = `\n\n${STEER_NOTE}`;

function withoutSteerTrailer(raw: string) {
  const index = raw.indexOf(STEER_SEPARATOR);
  return index === -1 ? raw : raw.slice(0, index);
}

function parseStructuredJson(raw: string, redact: (text: string) => string): JsonValue | undefined {
  try {
    const parsed: unknown = JSON.parse(withoutSteerTrailer(raw));

    if (!isPlainObject(parsed)) return undefined;

    return redactJson(parsed, redact);
  } catch {
    return undefined;
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
  #toolUi: Record<string, ToolUiEntry> = {};
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

  redactError(message: string) {
    return clip(this.#redact(message));
  }

  fail(message: string) {
    if (!this.error) this.error = this.redactError(message);
  }

  setError(message: string) {
    this.error = this.redactError(message);
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

  recordToolResult(id: string, name: string, rawOutput: string, failed = false): RunEvent[] {
    if (!this.#names.has(id)) this.#names.set(id, name);

    return this.finishTool(id, rawOutput, failed);
  }

  finishTool(id: string, rawOutput: string, failed: boolean): RunEvent[] {
    const aliased = this.#alias.get(id) ?? id;
    this.#open.delete(aliased);
    const name = this.#names.get(aliased) ?? this.#names.get(id);
    const structured = failed ? undefined : parseStructuredJson(rawOutput, this.#redact);
    const redacted = clip(this.#redact(rawOutput));
    let toolOutput: ToolResultOutput;

    if (failed) toolOutput = { type: "error-text", value: redacted };
    else if (structured !== undefined) toolOutput = { type: "json", value: structured };
    else toolOutput = { type: "text", value: redacted };

    this.#pushTool(aliased, toolOutput);
    let ui: ToolUiEntry | undefined;

    if (name === SHOW_ARTIFACT_TOOL_NAME && !failed) {
      const queued = this.#shown.shift();

      if (queued?.length) {
        const artifacts = queued.map((artifact) =>
          artifact.caption !== undefined
            ? { ...artifact, caption: this.#redact(artifact.caption) }
            : artifact,
        );
        ui = { artifacts };
        this.#toolUi[aliased] = ui;
      }
    }

    const projected = projectToolOutput(toolOutput, name, ui);
    const event: Extract<RunEvent, { type: "tool_end" }> = {
      type: "tool_end",
      id: aliased,
      ...projected,
    };

    if (ui?.artifacts?.length && !event.artifacts) event.artifacts = ui.artifacts;

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
          usage: addUsage(this.#generation.usage, turn),
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
    this.#toolUi = {};
    this.#generation = undefined;
    return messages;
  }

  messages(prompt: string): Message[] {
    const filed = [...this.#filed];

    if (this.#assistant.length > 0)
      filed.push(messageOf({ role: "assistant", content: this.#assistant }));

    if (this.#tools.length > 0) {
      filed.push(
        withToolUiMetadata(messageOf({ role: "tool", content: this.#tools }), this.#toolUi),
      );
    }

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
    const projected = projectToolCall({
      type: "tool-call",
      toolCallId: id,
      toolName: name,
      input: redactedInput as ToolCallPart["input"],
    });
    const rawTarget =
      target && target.length > 0
        ? target
        : projected.target || (toolTarget(name, redactedInput) ?? "");
    projected.target = this.#redact(rawTarget);

    if (
      (name === QUESTION_TOOL_NAME || name === SECRET_TOOL_NAME) &&
      (!projected.questions || projected.questions.length === 0)
    ) {
      delete projected.questions;
    }

    return projected;
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

  #pushTool(id: string, resultOutput: ToolResultOutput) {
    this.#flushAssistant();
    this.#tools.push({
      type: "tool-result",
      toolCallId: id,
      toolName: this.#names.get(id) ?? "tool",
      output: resultOutput,
    });
  }

  #flushAssistant() {
    if (this.#assistant.length === 0) return;

    this.#filed.push(messageOf({ role: "assistant", content: this.#assistant }));
    this.#assistant = [];
  }

  #flushTools() {
    if (this.#tools.length === 0) return;

    this.#filed.push(
      withToolUiMetadata(messageOf({ role: "tool", content: this.#tools }), this.#toolUi),
    );
    this.#tools = [];
    this.#toolUi = {};
  }
}
