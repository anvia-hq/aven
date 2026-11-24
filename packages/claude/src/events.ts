import type { Message } from "@anvia/core";
import { TurnRecorder } from "@aven/agent-backend/turn";
import { toolTarget } from "@aven/agents/tool-projection";
import { asRecord } from "@aven/agents/values";
import type { QuestionPrompt, RunEvent, TokenUsage, ToolArtifact } from "@aven/protocol/types";

import { limitsFromRateLimitEvent, limitsFromUsage } from "./limits";
import type { ClaudeModelUsage, ClaudeSdkMessage, ClaudeUsage } from "./types";

const STOPPED: Record<string, string> = {
  error_max_turns: "The run used all of its turns",
  error_max_budget_usd: "The run reached its spending limit",
  error_during_execution: "The run stopped while a tool was running",
};

const MCP_PREFIX = "mcp__aven__";

type Part = Record<string, unknown>;

function blocksOf(content: unknown): Part[] {
  if (!Array.isArray(content)) return [];

  return content.filter((block): block is Part => typeof block === "object" && block !== null);
}

function resultText(content: unknown) {
  if (typeof content === "string") return content;

  return blocksOf(content)
    .flatMap((part) => (typeof part.text === "string" && part.text.length > 0 ? [part.text] : []))
    .join("\n");
}

function shownName(name: string) {
  return name.startsWith(MCP_PREFIX) ? name.slice(MCP_PREFIX.length) : name;
}

function targetOf(name: string, input: unknown) {
  const args = asRecord(input);

  if (typeof args.command === "string" && args.command) return args.command;

  if (typeof args.path === "string" && args.path) return args.path;

  if (typeof args.file_path === "string" && args.file_path) return args.file_path;

  const shown = toolTarget(shownName(name), input);

  if (shown) return shown;

  const items = args.items;
  const first = Array.isArray(items) ? asRecord(items[0]) : {};
  return typeof first.path === "string" ? first.path : "";
}

function usageOf(usage: ClaudeUsage | undefined): TokenUsage | undefined {
  if (!usage || typeof usage.input_tokens !== "number") return undefined;

  const cacheWriteTokens = usage.cache_creation_input_tokens ?? 0;
  const cacheReadTokens = usage.cache_read_input_tokens ?? 0;

  return {
    inputTokens: usage.input_tokens + cacheWriteTokens + cacheReadTokens,
    outputTokens: usage.output_tokens ?? 0,
    cacheWriteTokens,
    cacheReadTokens,
  };
}

export class ClaudeTurn {
  #turn: TurnRecorder;
  #streamedText = false;
  #streamedThinking = false;
  #sawText = false;
  #lastCall: ClaudeUsage | undefined;

  constructor(redact: (text: string) => string = (text) => text, model?: string) {
    this.#turn = new TurnRecorder({
      provider: "anthropic",
      modelId: model ?? "claude",
      redact,
    });
  }

  get sessionId() {
    return this.#turn.sessionId;
  }

  get error() {
    return this.#turn.error;
  }

  redactError(message: string) {
    return this.#turn.redactError(message);
  }

  take(message: ClaudeSdkMessage): RunEvent[] {
    if (message.session_id) this.#turn.sessionId = message.session_id;

    if (message.type === "system") return [];

    if (message.type === "rate_limit_event") {
      const limits = limitsFromRateLimitEvent(message.rate_limit_info);

      return limits.length > 0 ? [{ type: "limits", limits }] : [];
    }

    if (message.type === "plan_limits") {
      const limits = limitsFromUsage(message.usage);

      return limits.length > 0 ? [{ type: "limits", limits }] : [];
    }

    if (message.type === "stream_event") return this.#delta(message);

    if (message.type === "assistant") return this.#assistantMessage(message);

    if (message.type === "user") return this.#toolResults(message);

    if (message.type === "result") return this.#result(message);

    return [];
  }

  queueArtifacts(artifacts: ToolArtifact[]) {
    this.#turn.queueArtifacts(artifacts);
  }

  openQuestion(name: string) {
    return this.#turn.openQuestion(name);
  }

  ensureQuestion(id: string, name: string, questions: QuestionPrompt[]): RunEvent | undefined {
    return this.#turn.ensureQuestion(id, name, questions);
  }

  recordToolResult(id: string, name: string, rawOutput: string, failed = false): RunEvent[] {
    return this.#turn.recordToolResult(id, name, rawOutput, failed);
  }

  release(prompt: string): Message[] {
    const messages = this.#turn.release(prompt);
    this.#streamedText = false;
    this.#streamedThinking = false;
    this.#sawText = false;
    this.#lastCall = undefined;
    return messages;
  }

  messages(prompt: string): Message[] {
    return this.#turn.messages(prompt);
  }

  #delta(message: Extract<ClaudeSdkMessage, { type: "stream_event" }>): RunEvent[] {
    const event = message.event;
    const delta = event?.delta;

    if (event?.type !== "content_block_delta" || !delta) return [];

    if (delta.type === "text_delta" && delta.text) {
      const events = this.#turn.pushText(delta.text);

      if (events.length === 0) return [];

      this.#streamedText = true;
      this.#sawText = true;
      return events;
    }

    if (delta.type === "thinking_delta" && delta.thinking) {
      const events = this.#turn.pushReasoning(delta.thinking);

      if (events.length === 0) return [];

      this.#streamedThinking = true;
      return events;
    }

    return [];
  }

  #context(modelUsage: Record<string, ClaudeModelUsage> | undefined) {
    const call = this.#lastCall;
    const contextWindow = Math.max(
      0,
      ...Object.values(modelUsage ?? {}).map((item) => item.contextWindow ?? 0),
    );

    if (!call || contextWindow <= 0) return undefined;

    const usedTokens =
      (call.input_tokens ?? 0) +
      (call.cache_creation_input_tokens ?? 0) +
      (call.cache_read_input_tokens ?? 0) +
      (call.output_tokens ?? 0);
    return usedTokens > 0 ? { usedTokens, contextWindow } : undefined;
  }

  #assistantMessage(message: Extract<ClaudeSdkMessage, { type: "assistant" }>): RunEvent[] {
    if (message.error === "authentication_failed") {
      this.#turn.setError("The Claude setup token was rejected. Replace it in Settings.");
    } else if (message.error) {
      this.#turn.fail(message.error);
    }

    if (!message.parent_tool_use_id && message.message?.usage) {
      this.#lastCall = message.message.usage;
    }

    const events: RunEvent[] = [];
    for (const block of blocksOf(message.message?.content)) {
      if (block.type === "text" && typeof block.text === "string") {
        if (this.#streamedText) continue;

        const pushed = this.#turn.pushText(block.text);

        if (pushed.length === 0) continue;

        this.#sawText = true;
        events.push(...pushed);
      } else if (block.type === "thinking" && typeof block.thinking === "string") {
        if (this.#streamedThinking) continue;

        events.push(...this.#turn.pushReasoning(block.thinking));
      } else if (block.type === "tool_use" && typeof block.name === "string") {
        const id =
          typeof block.id === "string" && block.id
            ? block.id
            : `tool-${this.#turn.announcedCount()}`;

        if (this.#turn.hasAnnounced(id)) continue;

        const name = shownName(block.name);

        if (this.#turn.aliasQuestion(id, name)) continue;

        events.push(
          ...this.#turn.beginTool(id, name, block.input, targetOf(block.name, block.input)),
        );
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

      events.push(
        ...this.#turn.finishTool(
          block.tool_use_id,
          resultText(block.content),
          block.is_error === true,
        ),
      );
    }
    return events;
  }

  #result(message: Extract<ClaudeSdkMessage, { type: "result" }>): RunEvent[] {
    const events: RunEvent[] = [];
    const usage = usageOf(message.usage);

    if (usage) {
      events.push(this.#turn.recordUsage(usage, this.#context(message.modelUsage)));
    }

    if (message.subtype && message.subtype !== "success") {
      const detail = (message.errors ?? []).filter((item) => item.length > 0).join(" ");
      let reason = STOPPED[message.subtype] ?? `The Claude agent stopped (${message.subtype})`;

      if (detail) reason = detail;
      else if (message.result) reason = message.result;

      this.#turn.fail(reason);
    } else if (message.result && !this.#sawText) {
      const pushed = this.#turn.pushText(message.result);

      if (pushed.length > 0) {
        this.#sawText = true;
        events.push(...pushed);
      }
    }

    return events;
  }
}
