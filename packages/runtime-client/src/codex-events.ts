import type { JsonValue, Message, ToolResultOutput } from "@anvia/core";
import { normalizeToolResultOutput } from "@anvia/core/tool";
import type { ThreadEvent } from "@openai/codex-sdk";

import {
  CODEX_BUDGET_USED,
  CODEX_LOGIN_REJECTED,
  CODEX_TURNS_USED,
} from "@aven/protocol/codex-login";
import type { TokenUsage } from "@aven/protocol/types";

import type { Emit } from "./types";

const TURNS = /turn limit|max(?:imum)? turns|too many turns/i;
const BUDGET = /budget|quota|rate limit|insufficient/i;
const LOGIN = /authentication|unauthorized|invalid token|chatgpt login|auth(?:entication)? failed/i;

export function codexFailure(detail: string): string {
  if (TURNS.test(detail)) return CODEX_TURNS_USED;

  if (BUDGET.test(detail)) return CODEX_BUDGET_USED;

  if (LOGIN.test(detail)) return CODEX_LOGIN_REJECTED;

  return detail.trim() || "The Codex run failed";
}

export function createCodexTranscript(emit: Emit, hide: (text: string) => string) {
  const messages: Message[] = [];
  const seen = new Map<string, string>();
  let steps = 0;

  const assistant = () => {
    const last = messages.at(-1);

    if (last?.role === "assistant") return last;

    const created: Message = { role: "assistant", content: [] };
    messages.push(created);
    return created;
  };
  const say = (id: string, kind: "text" | "reasoning", text: string) => {
    const hidden = hide(text);
    const previous = seen.get(id) ?? "";
    seen.set(id, hidden);
    const delta = hidden.startsWith(previous) ? hidden.slice(previous.length) : hidden;

    if (!delta) return;

    emit({ type: kind, delta });
  };
  const keepText = (kind: "text" | "reasoning", text: string) => {
    const hidden = hide(text);

    if (!hidden) return;

    const part =
      kind === "text"
        ? { type: "text" as const, text: hidden }
        : { type: "reasoning" as const, text: hidden };
    const current = assistant();
    const content = Array.isArray(current.content) ? current.content : [];
    messages[messages.length - 1] = { role: "assistant", content: [...content, part] };
  };
  const tool = (id: string, name: string, input: JsonValue, target: string) => {
    steps += 1;
    const part = { type: "tool-call" as const, toolCallId: id, toolName: name, input };
    const current = assistant();
    const content = Array.isArray(current.content) ? current.content : [];
    messages[messages.length - 1] = { role: "assistant", content: [...content, part] };
    emit({
      type: "tool_start",
      tool: { id, name, target, status: "running" },
    });
  };
  const result = (id: string, name: string, output: ToolResultOutput) => {
    messages.push({
      role: "tool",
      content: [{ type: "tool-result", toolCallId: id, toolName: name, output }],
    });
    const shown = output.type === "error-text" ? output.value : textOf(output);
    emit({
      type: "tool_end",
      id,
      status: output.type === "error-text" || output.type === "error-json" ? "error" : "done",
      output: hide(shown),
    });
  };

  return {
    messages,
    steps: () => steps,
    countStep() {
      steps += 1;
    },
    apply(event: ThreadEvent): string | undefined {
      if (event.type === "turn.completed") {
        emit({ type: "usage", turn: usageOf(event.usage) });
        return;
      }

      if (event.type === "turn.failed" || event.type === "error") {
        return codexFailure(hide(event.type === "error" ? event.message : event.error.message));
      }

      if (
        event.type !== "item.completed" &&
        event.type !== "item.updated" &&
        event.type !== "item.started"
      ) {
        return;
      }

      const item = event.item;

      if (item.type === "agent_message" || item.type === "reasoning") {
        const kind = item.type === "agent_message" ? "text" : "reasoning";
        say(item.id, kind, item.text);

        if (event.type === "item.completed") {
          keepText(kind, item.text);

          if (item.type === "agent_message") steps += 1;
        }

        return;
      }

      if (item.type === "error" && event.type === "item.completed") {
        keepText("text", item.message);
        emit({ type: "text", delta: hide(item.message) });
        return;
      }

      if (item.type === "todo_list" && event.type === "item.completed") {
        const note = item.items
          .map((entry) => `${entry.completed ? "done" : "todo"} ${entry.text}`)
          .join("\n");

        if (note) {
          keepText("text", note);
          emit({ type: "text", delta: hide(note) });
        }

        return;
      }

      if (item.type === "mcp_tool_call") return;

      if (item.type === "command_execution" && event.type === "item.started") {
        tool(item.id, "exec_command", { command: item.command }, item.command);
        return;
      }

      if (item.type === "command_execution" && event.type === "item.completed") {
        const failed = item.exit_code !== undefined && item.exit_code !== 0;
        result(
          item.id,
          "exec_command",
          failed
            ? { type: "error-text", value: item.aggregated_output || `exited ${item.exit_code}` }
            : { type: "text", value: item.aggregated_output },
        );
        return;
      }

      if (item.type === "file_change" && event.type === "item.completed") {
        const target = item.changes.map((change) => change.path).join(", ");
        tool(item.id, "edit", { changes: item.changes }, target);
        result(
          item.id,
          "edit",
          item.status === "failed"
            ? { type: "error-text", value: "The file change failed" }
            : { type: "text", value: target },
        );
      }
    },
  };
}

function usageOf(usage: {
  input_tokens: number;
  output_tokens: number;
  cache_write_input_tokens: number;
  cached_input_tokens: number;
}): TokenUsage {
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheWriteTokens: usage.cache_write_input_tokens,
    cacheReadTokens: usage.cached_input_tokens,
  };
}

function textOf(output: ToolResultOutput): string {
  if (output.type === "text" || output.type === "error-text") return output.value;

  if (output.type === "json" || output.type === "error-json") return JSON.stringify(output.value);

  if (output.type === "content") {
    return output.value.map((part) => (part.type === "text" ? part.text : "")).join("");
  }

  return output.reason ?? "";
}

export function toolOutput(value: unknown): ToolResultOutput {
  return normalizeToolResultOutput(value);
}
