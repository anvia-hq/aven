import { describe, expect, test } from "bun:test";

import { createCodexProjector } from "./codex-projection";
import { applyEvent } from "@aven/protocol/events";
import type { CodexEvent } from "./types";
import type { ChatMessage, RunEvent } from "@aven/protocol/types";

const project = (events: CodexEvent[]) => {
  const projector = createCodexProjector();
  return { projector, out: events.flatMap((event) => projector.project(event)) };
};

describe("codex projection", () => {
  test("an agent message grows into text deltas, however often it is updated", () => {
    const { out } = project([
      { type: "item.started", item: { id: "m", type: "agent_message", text: "Hel" } },
      { type: "item.updated", item: { id: "m", type: "agent_message", text: "Hello wor" } },
      { type: "item.completed", item: { id: "m", type: "agent_message", text: "Hello world" } },
    ]);
    expect(out).toEqual([
      { type: "text", delta: "Hel" },
      { type: "text", delta: "lo wor" },
      { type: "text", delta: "ld" },
    ]);
  });

  test("reasoning is shown as reasoning, not as text", () => {
    const { out } = project([
      { type: "item.completed", item: { id: "r", type: "reasoning", text: "thinking" } },
    ]);
    expect(out).toEqual([{ type: "reasoning", delta: "thinking" }]);
  });

  test("a command shows as exec_command with its command, and its exit code in the output", () => {
    const command = { id: "c", type: "command_execution" as const, command: "bun test" };
    const { out } = project([
      {
        type: "item.started",
        item: { ...command, aggregated_output: "", status: "in_progress" },
      },
      {
        type: "item.completed",
        item: { ...command, aggregated_output: "1 fail", exit_code: 1, status: "completed" },
      },
    ]);
    expect(out).toEqual([
      {
        type: "tool_start",
        tool: { id: "c", name: "exec_command", target: "bun test", status: "running" },
      },
      { type: "tool_end", id: "c", status: "done", output: "1 fail\n[exit 1]" },
    ]);
  });

  test("a command that only ever arrives finished still shows its start and its end", () => {
    const { out } = project([
      {
        type: "item.completed",
        item: {
          id: "c",
          type: "command_execution",
          command: "ls",
          aggregated_output: "a",
          exit_code: 0,
          status: "completed",
        },
      },
    ]);
    expect(out.map((event) => event.type)).toEqual(["tool_start", "tool_end"]);
  });

  test("a tool that finishes in an update and again in the completed event ends once", () => {
    const search = { id: "w", type: "web_search" as const, query: "bun" };
    const { out } = project([
      { type: "item.started", item: search },
      { type: "item.completed", item: search },
      { type: "item.completed", item: search },
    ]);
    expect(out.filter((event) => event.type === "tool_end")).toHaveLength(1);
    expect(out[0]).toMatchObject({ tool: { name: "web_search", target: "bun" } });
  });

  test("a failed command with no exit code is an error", () => {
    const { out } = project([
      {
        type: "item.completed",
        item: {
          id: "c",
          type: "command_execution",
          command: "x",
          aggregated_output: "",
          status: "failed",
        },
      },
    ]);
    expect(out[1]).toMatchObject({ type: "tool_end", status: "error" });
  });

  test("a file change lists what it touched, and a failed one is an error", () => {
    const changes = [
      { path: "a.ts", kind: "update" as const },
      { path: "b.ts", kind: "add" as const },
    ];
    const done = project([
      {
        type: "item.completed",
        item: { id: "f", type: "file_change", changes, status: "completed" },
      },
    ]).out;
    expect(done[0]).toMatchObject({ tool: { name: "apply_patch", target: "a.ts, b.ts" } });
    expect(done[1]).toMatchObject({ status: "done", output: "update a.ts\nadd b.ts" });
    const failed = project([
      { type: "item.completed", item: { id: "f", type: "file_change", changes, status: "failed" } },
    ]).out;
    expect(failed[1]).toMatchObject({ status: "error" });
  });

  test("a call to one of Aven's own tools shows as that tool, with its target and its result", () => {
    const call = { id: "t", type: "mcp_tool_call" as const, server: "aven", tool: "read_file" };
    const { out } = project([
      {
        type: "item.started",
        item: { ...call, arguments: { path: "a.txt" }, status: "in_progress" },
      },
      {
        type: "item.completed",
        item: {
          ...call,
          arguments: { path: "a.txt" },
          status: "completed",
          result: { content: [], structured_content: { content: "hello" } },
        },
      },
    ]);
    expect(out).toEqual([
      {
        type: "tool_start",
        tool: { id: "t", name: "read_file", target: "a.txt", status: "running" },
      },
      { type: "tool_end", id: "t", status: "done", output: "hello" },
    ]);
  });

  test("an Aven tool's question reaches the transcript as a question to answer", () => {
    const { out } = project([
      {
        type: "item.started",
        item: {
          id: "q",
          type: "mcp_tool_call",
          server: "aven",
          tool: "ask_user",
          arguments: { questions: [{ id: "a", text: "Which?" }] },
          status: "in_progress",
        },
      },
    ]);
    expect(out[0]).toMatchObject({
      type: "tool_start",
      tool: { name: "ask_user", questions: [{ id: "a", text: "Which?" }] },
    });
  });

  test("a tool of another MCP server is named with its server, and its error shows", () => {
    const { out } = project([
      {
        type: "item.completed",
        item: {
          id: "x",
          type: "mcp_tool_call",
          server: "linear",
          tool: "search",
          arguments: {},
          status: "failed",
          error: { message: "401" },
        },
      },
    ]);
    expect(out).toEqual([
      {
        type: "tool_start",
        tool: { id: "x", name: "linear__search", target: "", status: "running" },
      },
      { type: "tool_end", id: "x", status: "error", output: "401" },
    ]);
  });

  test("a turn's usage does not count cached input twice", () => {
    const { out } = project([
      {
        type: "turn.completed",
        usage: {
          input_tokens: 1000,
          cached_input_tokens: 800,
          cache_write_input_tokens: 5,
          output_tokens: 50,
        },
      },
    ]);
    expect(out).toEqual([
      {
        type: "usage",
        turn: { inputTokens: 200, outputTokens: 50, cacheWriteTokens: 5, cacheReadTokens: 800 },
      },
    ]);
  });

  test("a failed turn, an error event and an error item are each an error", () => {
    const { out } = project([
      { type: "turn.failed", error: { message: "limit" } },
      { type: "error", message: "boom" },
      { type: "item.completed", item: { id: "e", type: "error", message: "bad" } },
      { type: "item.started", item: { id: "e2", type: "error", message: "not yet" } },
    ]);
    expect(out).toEqual([
      { type: "error", message: "limit" },
      { type: "error", message: "boom" },
      { type: "error", message: "bad" },
    ]);
  });

  test("the thread id is kept to resume with, and a todo list shows nothing", () => {
    const { projector, out } = project([
      { type: "thread.started", thread_id: "th_1" },
      { type: "turn.started" },
      { type: "item.completed", item: { id: "p", type: "todo_list", items: [] } },
    ]);
    expect(projector.threadId).toBe("th_1");
    expect(out).toEqual([]);
  });

  test("a run's events build the same transcript the chat shows for an Aven run", () => {
    const { out } = project([
      { type: "item.completed", item: { id: "m", type: "agent_message", text: "Looking." } },
      {
        type: "item.completed",
        item: {
          id: "c",
          type: "command_execution",
          command: "ls",
          aggregated_output: "a",
          exit_code: 0,
          status: "completed",
        },
      },
      { type: "item.completed", item: { id: "n", type: "agent_message", text: "Done." } },
    ]);
    const chat = [{ type: "run_start", prompt: "go" } as RunEvent, ...out].reduce<ChatMessage[]>(
      (messages, event) => applyEvent(messages, event),
      [],
    );
    expect(chat.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(chat[1]!.parts.map((part) => part.type)).toEqual(["text", "tool", "text"]);
  });
});
