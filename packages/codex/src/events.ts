import type { Message } from "@anvia/core";
import { TurnRecorder } from "@aven/agent-backend/turn";
import { toolTarget } from "@aven/agents/tool-projection";
import { TODO_TOOL_NAME } from "@aven/agents/tools/todo";
import { codexContextOf, codexResolvedOf } from "@aven/protocol/codex-models";
import type {
  ContextUsage,
  QuestionPrompt,
  RunEvent,
  TokenUsage,
  ToolArtifact,
} from "@aven/protocol/types";

import type { CodexSdkEvent, CodexSdkItem, CodexUsage } from "./types";

const AUTH_FAILURE =
  "The Codex sign-in was rejected. Sign in again with codex login and replace it in Settings.";

const KEY_REJECTION =
  /incorrect api key|invalid api key|invalid_api_key|\bunauthorized\b|\bunauthenticated\b/;

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

  if (KEY_REJECTION.test(lower)) return true;

  return (
    /^\s*401\b/.test(lower) ||
    /\bhttp\s+401\b/.test(lower) ||
    /\bstatus(?:\s+code)?\s*[:= ]\s*401\b/.test(lower)
  );
}

function resultText(item: Extract<CodexSdkItem, { type: "mcp_tool_call" }>) {
  if (item.error?.message) return item.error.message;

  return (item.result?.content ?? [])
    .flatMap((part) => (typeof part.text === "string" && part.text.length > 0 ? [part.text] : []))
    .join("\n");
}

export class CodexTurn {
  #turn: TurnRecorder;
  #contextWindow: number;
  #seen = new Map<string, string>();

  constructor(model: string | undefined, redact: (text: string) => string = (text) => text) {
    this.#turn = new TurnRecorder({
      provider: "openai",
      modelId: codexResolvedOf(model),
      redact,
    });
    this.#contextWindow = codexContextOf(model);
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

  beginTurn() {
    this.#turn.resetTurnItems();
    this.#seen.clear();
  }

  take(event: CodexSdkEvent): RunEvent[] {
    if (event.type === "thread.started") {
      this.#turn.sessionId = event.thread_id;
      return [];
    }

    if (event.type === "turn.started") {
      this.beginTurn();
      return [];
    }

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
    this.#turn.queueArtifacts(artifacts);
  }

  openQuestion(name: string) {
    return this.#turn.openQuestion(name);
  }

  ensureQuestion(id: string, name: string, questions: QuestionPrompt[]): RunEvent | undefined {
    return this.#turn.ensureQuestion(id, name, questions);
  }

  release(prompt: string): Message[] {
    return this.#turn.release(prompt);
  }

  messages(prompt: string): Message[] {
    return this.#turn.messages(prompt);
  }

  #fail(message: string) {
    if (rejectedKey(message)) {
      this.#turn.setError(AUTH_FAILURE);
      return;
    }

    this.#turn.fail(message);
  }

  #delta(id: string, text: string, kind: "text" | "reasoning"): RunEvent[] {
    const previous = this.#seen.get(id) ?? "";
    const next = text.startsWith(previous) ? text.slice(previous.length) : text;
    this.#seen.set(id, text);

    if (!next) return [];

    return kind === "reasoning" ? this.#turn.pushReasoning(next) : this.#turn.pushText(next);
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
      return this.#turn.beginTool(item.id, "exec_command", { command: item.command }, item.command);
    }

    if (item.type === "mcp_tool_call") return this.#beginMcp(item);

    if (item.type === "web_search") {
      return this.#turn.beginTool(item.id, "web_search", { query: item.query }, item.query);
    }

    return [];
  }

  #completed(item: CodexSdkItem): RunEvent[] {
    if (item.type === "agent_message") return this.#delta(item.id, item.text, "text");

    if (item.type === "reasoning") return this.#delta(item.id, item.text, "reasoning");

    if (item.type === "command_execution") {
      const events = this.#turn.ensureTool(
        item.id,
        "exec_command",
        { command: item.command },
        item.command,
      );
      const failed =
        item.status === "failed" || (item.exit_code !== undefined && item.exit_code !== 0);
      events.push(...this.#turn.finishTool(item.id, item.aggregated_output, failed));
      return events;
    }

    if (item.type === "file_change") {
      const target = item.changes[0]?.path ?? "";
      const events = this.#turn.ensureTool(
        item.id,
        "apply_patch",
        { changes: item.changes },
        target,
      );
      const output = item.changes.map((change) => `${change.kind} ${change.path}`).join("\n");
      events.push(...this.#turn.finishTool(item.id, output, item.status === "failed"));
      return events;
    }

    if (item.type === "mcp_tool_call") {
      const events = this.#beginMcp(item);
      const failed = item.status === "failed" || Boolean(item.error);
      events.push(...this.#turn.finishTool(item.id, resultText(item), failed));
      return events;
    }

    if (item.type === "web_search") {
      const events = this.#turn.ensureTool(
        item.id,
        "web_search",
        { query: item.query },
        item.query,
      );
      events.push(...this.#turn.finishTool(item.id, item.query, false));
      return events;
    }

    if (item.type === "todo_list") {
      const output = item.items
        .map((todo) => `${todo.completed ? "x" : " "} ${todo.text}`)
        .join("\n");
      const events = this.#turn.ensureTool(item.id, TODO_TOOL_NAME, { items: item.items }, "");
      events.push(...this.#turn.finishTool(item.id, output, false));
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
    return [this.#turn.recordUsage(turn, context)];
  }

  #beginMcp(item: Extract<CodexSdkItem, { type: "mcp_tool_call" }>): RunEvent[] {
    const name = item.tool;

    if (this.#turn.aliasQuestion(item.id, name)) return [];

    const target = toolTarget(name, item.arguments) ?? "";
    return this.#turn.beginTool(item.id, name, item.arguments, target);
  }
}
