import type {
  AssistantContentPart,
  JsonValue,
  Message,
  ToolResultOutput,
  ToolResultPart,
} from "@anvia/core";

import { projectToolCall, projectToolOutput } from "./tool-projection";
import type { CodexEvent, CodexItem, CodexProjector } from "./types";
import type { RunEvent, ToolPart } from "@aven/protocol/types";

export const CODEX_AVEN_SERVER = "aven";

const COMMAND_TOOL = "exec_command";
const PATCH_TOOL = "apply_patch";
const SEARCH_TOOL = "web_search";

type ToolItem = Exclude<CodexItem, { type: "agent_message" | "reasoning" | "todo_list" | "error" }>;

const startOf = (item: ToolItem): ToolPart => {
  switch (item.type) {
    case "command_execution":
      return projectToolCall({
        type: "tool-call",
        toolCallId: item.id,
        toolName: COMMAND_TOOL,
        input: { command: item.command },
      });
    case "file_change":
      return {
        id: item.id,
        name: PATCH_TOOL,
        target: item.changes.map(({ path }) => path).join(", "),
        status: "running",
      };
    case "web_search":
      return projectToolCall({
        type: "tool-call",
        toolCallId: item.id,
        toolName: SEARCH_TOOL,
        input: { query: item.query },
      });
    case "mcp_tool_call":
      return item.server === CODEX_AVEN_SERVER
        ? projectToolCall({
            type: "tool-call",
            toolCallId: item.id,
            toolName: item.tool,
            input: item.arguments,
          })
        : {
            id: item.id,
            name: `${item.server}__${item.tool}`,
            target: "",
            status: "running",
          };
  }
};

const outputOf = (item: ToolItem): ToolResultOutput => {
  switch (item.type) {
    case "command_execution":
      return item.status === "failed" && item.exit_code === undefined
        ? { type: "error-text", value: item.aggregated_output || "The command failed" }
        : {
            type: "json",
            value: {
              status: "exited",
              exitCode: item.exit_code ?? 0,
              stdout: item.aggregated_output,
              stderr: "",
            },
          };
    case "file_change":
      return item.status === "failed"
        ? { type: "error-text", value: "The patch did not apply" }
        : {
            type: "text",
            value: item.changes.map(({ kind, path }) => `${kind} ${path}`).join("\n"),
          };
    case "web_search":
      return { type: "text", value: "" };
    case "mcp_tool_call": {
      if (item.error || item.status === "failed") {
        return { type: "error-text", value: item.error?.message ?? "The tool failed" };
      }
      const structured = item.result?.structured_content;
      if (structured !== undefined && structured !== null) {
        return { type: "json", value: structured };
      }
      return {
        type: "text",
        value: (item.result?.content ?? []).map((part) => part.text ?? "").join(""),
      };
    }
  }
};

const nameOf = (item: ToolItem) => {
  switch (item.type) {
    case "command_execution":
      return COMMAND_TOOL;
    case "file_change":
      return PATCH_TOOL;
    case "web_search":
      return SEARCH_TOOL;
    case "mcp_tool_call":
      return item.server === CODEX_AVEN_SERVER ? item.tool : `${item.server}__${item.tool}`;
  }
};

const inputOf = (item: ToolItem): JsonValue => {
  switch (item.type) {
    case "command_execution":
      return { command: item.command };
    case "file_change":
      return { changes: item.changes };
    case "web_search":
      return { query: item.query };
    case "mcp_tool_call":
      return item.arguments;
  }
};

const endOf = (item: ToolItem): Extract<RunEvent, { type: "tool_end" }> => ({
  type: "tool_end",
  id: item.id,
  ...projectToolOutput(outputOf(item), nameOf(item)),
});

export function createCodexProjector(): CodexProjector {
  const said = new Map<string, string>();
  const started = new Set<string>();
  const ended = new Set<string>();
  const calls = new Map<string, ToolItem>();
  const results = new Map<string, ToolItem>();
  const sequence: ({ kind: "text"; id: string } | { kind: "tool"; id: string })[] = [];
  let threadId: string | undefined;

  const grown = (id: string, text: string) => {
    const before = said.get(id) ?? "";
    said.set(id, text);
    return text.startsWith(before) ? text.slice(before.length) : text;
  };

  const spoken = (item: CodexItem): RunEvent[] => {
    if (item.type !== "agent_message" && item.type !== "reasoning") return [];
    if (item.type === "agent_message" && !said.has(item.id)) {
      sequence.push({ kind: "text", id: item.id });
    }
    const delta = grown(item.id, item.text);
    if (!delta) return [];
    return [{ type: item.type === "agent_message" ? "text" : "reasoning", delta }];
  };

  const tooled = (kind: CodexEvent["type"], item: ToolItem): RunEvent[] => {
    const events: RunEvent[] = [];
    if (!started.has(item.id)) {
      started.add(item.id);
      sequence.push({ kind: "tool", id: item.id });
      events.push({ type: "tool_start", tool: startOf(item) });
    }
    calls.set(item.id, item);
    const finished =
      kind === "item.completed" ||
      (item.type !== "web_search" && item.status !== "in_progress" && kind !== "item.started");
    if (finished && !ended.has(item.id)) {
      ended.add(item.id);
      results.set(item.id, item);
      events.push(endOf(item));
    }
    return events;
  };

  return {
    get threadId() {
      return threadId;
    },
    messages() {
      const content: AssistantContentPart[] = [];
      const done: ToolResultPart[] = [];
      for (const entry of sequence) {
        if (entry.kind === "text") {
          const text = said.get(entry.id) ?? "";
          if (text.trim()) content.push({ type: "text", text });
          continue;
        }
        const call = calls.get(entry.id)!;
        content.push({
          type: "tool-call",
          toolCallId: entry.id,
          toolName: nameOf(call),
          input: inputOf(call),
        });
        const finished = results.get(entry.id);
        if (finished) {
          done.push({
            type: "tool-result",
            toolCallId: entry.id,
            toolName: nameOf(finished),
            output: outputOf(finished),
          });
        }
      }
      const messages: Message[] = [];
      if (content.length) messages.push({ role: "assistant", content });
      if (done.length) messages.push({ role: "tool", content: done });
      return messages;
    },
    project(event) {
      switch (event.type) {
        case "thread.started":
          threadId = event.thread_id;
          return [];
        case "turn.completed": {
          const { usage } = event;
          const cached = usage.cached_input_tokens;
          return [
            {
              type: "usage",
              turn: {
                inputTokens: Math.max(0, usage.input_tokens - cached),
                outputTokens: usage.output_tokens,
                cacheWriteTokens: usage.cache_write_input_tokens ?? 0,
                cacheReadTokens: cached,
              },
            },
          ];
        }
        case "turn.failed":
          return [{ type: "error", message: event.error.message }];
        case "error":
          return [{ type: "error", message: event.message }];
        case "item.started":
        case "item.updated":
        case "item.completed": {
          const { item } = event;
          if (item.type === "agent_message" || item.type === "reasoning") return spoken(item);
          if (item.type === "error") {
            return event.type === "item.completed"
              ? [{ type: "error", message: item.message }]
              : [];
          }
          if (item.type === "todo_list") return [];
          return tooled(event.type, item);
        }
        default:
          return [];
      }
    },
  };
}
