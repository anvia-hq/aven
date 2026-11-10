import type { ToolResultOutput } from "@anvia/core";

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

const endOf = (item: ToolItem): Extract<RunEvent, { type: "tool_end" }> => {
  const end = (name: string, output: ToolResultOutput) => ({
    type: "tool_end" as const,
    id: item.id,
    ...projectToolOutput(output, name),
  });
  switch (item.type) {
    case "command_execution":
      return end(
        COMMAND_TOOL,
        item.status === "failed" && item.exit_code === undefined
          ? { type: "error-text", value: item.aggregated_output || "The command failed" }
          : {
              type: "json",
              value: {
                status: "exited",
                exitCode: item.exit_code ?? 0,
                stdout: item.aggregated_output,
                stderr: "",
              },
            },
      );
    case "file_change":
      return end(
        PATCH_TOOL,
        item.status === "failed"
          ? { type: "error-text", value: "The patch did not apply" }
          : {
              type: "text",
              value: item.changes.map(({ kind, path }) => `${kind} ${path}`).join("\n"),
            },
      );
    case "web_search":
      return end(SEARCH_TOOL, { type: "text", value: "" });
    case "mcp_tool_call": {
      const name = item.server === CODEX_AVEN_SERVER ? item.tool : `${item.server}__${item.tool}`;
      if (item.error || item.status === "failed") {
        return end(name, { type: "error-text", value: item.error?.message ?? "The tool failed" });
      }
      const structured = item.result?.structured_content;
      if (structured !== undefined && structured !== null) {
        return end(name, { type: "json", value: structured });
      }
      const text = (item.result?.content ?? []).map((part) => part.text ?? "").join("");
      return end(name, { type: "text", value: text });
    }
  }
};

export function createCodexProjector(): CodexProjector {
  const said = new Map<string, string>();
  const started = new Set<string>();
  const ended = new Set<string>();
  let threadId: string | undefined;

  const grown = (id: string, text: string) => {
    const before = said.get(id) ?? "";
    said.set(id, text);
    return text.startsWith(before) ? text.slice(before.length) : text;
  };

  const spoken = (item: CodexItem): RunEvent[] => {
    if (item.type !== "agent_message" && item.type !== "reasoning") return [];
    const delta = grown(item.id, item.text);
    if (!delta) return [];
    return [{ type: item.type === "agent_message" ? "text" : "reasoning", delta }];
  };

  const tooled = (kind: CodexEvent["type"], item: ToolItem): RunEvent[] => {
    const events: RunEvent[] = [];
    if (!started.has(item.id)) {
      started.add(item.id);
      events.push({ type: "tool_start", tool: startOf(item) });
    }
    const finished =
      kind === "item.completed" ||
      (item.type !== "web_search" && item.status !== "in_progress" && kind !== "item.started");
    if (finished && !ended.has(item.id)) {
      ended.add(item.id);
      events.push(endOf(item));
    }
    return events;
  };

  return {
    get threadId() {
      return threadId;
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
