import { describe, expect, test } from "bun:test";

import { CodexTurn } from "./codex-events";
import type { CodexUsage } from "@aven/agent-backend/types";

const TOKEN = "sk-codex-should-never-leak-0001";

const redact = (text: string) => text.replaceAll(TOKEN, "[redacted]");

const usage = (extra: Partial<CodexUsage> = {}): CodexUsage => ({
  input_tokens: 3,
  cached_input_tokens: 1,
  cache_write_input_tokens: 0,
  output_tokens: 2,
  reasoning_output_tokens: 0,
  ...extra,
});

describe("Codex stream events become thread events", () => {
  test("maps text, reasoning, a tool call, its result and usage", () => {
    const turn = new CodexTurn("default", redact);
    const events = [
      ...turn.take({ type: "thread.started", thread_id: "sess-1" }),
      ...turn.take({
        type: "item.updated",
        item: { id: "m1", type: "agent_message", text: "Hel" },
      }),
      ...turn.take({
        type: "item.updated",
        item: { id: "m1", type: "agent_message", text: "Hello" },
      }),
      ...turn.take({
        type: "item.completed",
        item: { id: "r1", type: "reasoning", text: "a thought" },
      }),
      ...turn.take({
        type: "item.started",
        item: {
          id: "c1",
          type: "command_execution",
          command: "pwd",
          aggregated_output: "",
          status: "in_progress",
        },
      }),
      ...turn.take({
        type: "item.completed",
        item: {
          id: "c1",
          type: "command_execution",
          command: "pwd",
          aggregated_output: `saw ${TOKEN}`,
          exit_code: 0,
          status: "completed",
        },
      }),
      ...turn.take({ type: "turn.completed", usage: usage() }),
    ];

    expect(events).toEqual([
      { type: "text", delta: "Hel" },
      { type: "text", delta: "lo" },
      { type: "reasoning", delta: "a thought" },
      {
        type: "tool_start",
        tool: { id: "c1", name: "exec_command", target: "pwd", status: "running" },
      },
      { type: "tool_end", id: "c1", status: "done", output: "saw [redacted]" },
      {
        type: "usage",
        turn: { inputTokens: 3, outputTokens: 2, cacheWriteTokens: 0, cacheReadTokens: 1 },
        context: { usedTokens: 5, contextWindow: 272_000 },
      },
    ]);
    expect(turn.sessionId).toBe("sess-1");
    expect(JSON.stringify(events)).not.toContain(TOKEN);
    const filed = turn.messages("please look");
    expect(filed.map((message) => message.role)).toEqual(["user", "assistant", "tool"]);
    expect(JSON.stringify(filed)).not.toContain(TOKEN);
    expect(JSON.stringify(filed)).toContain("Hello");
  });

  test("uses the menu model's context window, including Terra's", () => {
    const terra = new CodexTurn("terra");
    const events = terra.take({
      type: "turn.completed",
      usage: usage({ input_tokens: 10, output_tokens: 4 }),
    });
    expect(events).toContainEqual({
      type: "usage",
      turn: { inputTokens: 10, outputTokens: 4, cacheWriteTokens: 0, cacheReadTokens: 1 },
      context: { usedTokens: 14, contextWindow: 500_000 },
    });
  });

  test("maps a file change, a search and a todo list", () => {
    const turn = new CodexTurn("default");
    const events = [
      ...turn.take({
        type: "item.completed",
        item: {
          id: "f1",
          type: "file_change",
          changes: [{ path: "src/app.ts", kind: "update" }],
          status: "completed",
        },
      }),
      ...turn.take({
        type: "item.completed",
        item: { id: "w1", type: "web_search", query: "aven" },
      }),
      ...turn.take({
        type: "item.completed",
        item: {
          id: "t1",
          type: "todo_list",
          items: [
            { text: "write it", completed: true },
            { text: "ship it", completed: false },
          ],
        },
      }),
    ];
    expect(events).toContainEqual({
      type: "tool_start",
      tool: { id: "f1", name: "apply_patch", target: "src/app.ts", status: "running" },
    });
    expect(events).toContainEqual({
      type: "tool_end",
      id: "f1",
      status: "done",
      output: "update src/app.ts",
    });
    expect(events).toContainEqual({
      type: "tool_end",
      id: "t1",
      status: "done",
      output: "x write it\n  ship it",
    });
  });

  test("a rejected key becomes a settings error, and another failure stays the message", () => {
    const rejected = new CodexTurn("default");
    rejected.take({ type: "error", message: "401 Incorrect API key provided" });
    expect(rejected.error).toBe("The Codex API key was rejected. Replace it in Settings.");

    const http = new CodexTurn("default");
    http.take({ type: "turn.failed", error: { message: "HTTP 401 Unauthorized" } });
    expect(http.error).toBe("The Codex API key was rejected. Replace it in Settings.");

    const status = new CodexTurn("default");
    status.take({ type: "error", message: "status code: 401" });
    expect(status.error).toBe("The Codex API key was rejected. Replace it in Settings.");

    const failed = new CodexTurn("default", redact);
    failed.take({ type: "turn.failed", error: { message: `boom ${TOKEN}` } });
    expect(failed.error).toBe("boom [redacted]");

    const counted = new CodexTurn("default");
    counted.take({ type: "error", message: "wrote 401 bytes" });
    expect(counted.error).toBe("wrote 401 bytes");

    const numbered = new CodexTurn("default");
    numbered.take({ type: "error", message: "request id 40123" });
    expect(numbered.error).toBe("request id 40123");
  });

  test("aliases a second ask_user call onto the question already open", () => {
    const turn = new CodexTurn("default");
    const started = turn.take({
      type: "item.started",
      item: {
        id: "q1",
        type: "mcp_tool_call",
        server: "aven",
        tool: "ask_user",
        arguments: { questions: [{ id: "color", text: "Which color?" }] },
        status: "in_progress",
      },
    });
    expect(started[0]).toMatchObject({ type: "tool_start", tool: { id: "q1", name: "ask_user" } });
    const again = turn.take({
      type: "item.started",
      item: {
        id: "q2",
        type: "mcp_tool_call",
        server: "aven",
        tool: "ask_user",
        arguments: { questions: [{ id: "color", text: "Which color?" }] },
        status: "in_progress",
      },
    });
    expect(again).toEqual([]);
    const done = turn.take({
      type: "item.completed",
      item: {
        id: "q2",
        type: "mcp_tool_call",
        server: "aven",
        tool: "ask_user",
        arguments: {},
        status: "completed",
        result: { content: [{ type: "text", text: "color: red" }] },
      },
    });
    expect(done).toEqual([{ type: "tool_end", id: "q1", status: "done", output: "color: red" }]);
  });
});
