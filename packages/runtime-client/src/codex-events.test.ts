import { describe, expect, test } from "bun:test";
import type { ThreadEvent } from "@openai/codex-sdk";

import { CODEX_LOGIN_REJECTED, CODEX_TURNS_USED } from "@aven/protocol/codex-login";
import type { RunEvent } from "@aven/protocol/types";

import { createCodexTranscript } from "./codex-events";

const usage = {
  input_tokens: 4,
  output_tokens: 2,
  cache_write_input_tokens: 1,
  cached_input_tokens: 3,
  reasoning_output_tokens: 0,
};

function apply(events: ThreadEvent[], hide = (text: string) => text) {
  const seen: RunEvent[] = [];
  const transcript = createCodexTranscript((event) => seen.push(event), hide);
  const errors = events.map((event) => transcript.apply(event));
  return { seen, errors, messages: transcript.messages };
}

describe("Codex events", () => {
  test("turns text, reasoning and usage into run events", () => {
    const { seen, messages } = apply([
      { type: "item.completed", item: { id: "r", type: "reasoning", text: "thinking" } },
      { type: "item.completed", item: { id: "m", type: "agent_message", text: "hello" } },
      { type: "turn.completed", usage },
    ]);

    expect(seen).toEqual([
      { type: "reasoning", delta: "thinking" },
      { type: "text", delta: "hello" },
      {
        type: "usage",
        turn: { inputTokens: 4, outputTokens: 2, cacheWriteTokens: 1, cacheReadTokens: 3 },
      },
    ]);
    expect(JSON.stringify(messages)).toContain("hello");
  });

  test("hides the login and maps a rejected login and a turn limit", () => {
    const token = "eyJhbGciOiJub25lIn0.payload.signature";
    const { seen, errors } = apply(
      [
        {
          type: "item.completed",
          item: { id: "m", type: "agent_message", text: `token ${token}` },
        },
        { type: "turn.failed", error: { message: "unauthorized invalid token" } },
        { type: "error", message: "hit the turn limit" },
      ],
      (text) => text.split(token).join("[redacted]"),
    );

    expect(JSON.stringify(seen)).not.toContain(token);
    expect(JSON.stringify(seen)).toContain("[redacted]");
    expect(errors[1]).toBe(CODEX_LOGIN_REJECTED);
    expect(errors[2]).toBe(CODEX_TURNS_USED);
  });

  test("shows Codex's own command when one slips through, and not an MCP call twice", () => {
    const { seen } = apply([
      {
        type: "item.started",
        item: {
          id: "c",
          type: "command_execution",
          command: "ls",
          aggregated_output: "",
          status: "in_progress",
        },
      },
      {
        type: "item.completed",
        item: {
          id: "c",
          type: "command_execution",
          command: "ls",
          aggregated_output: "src",
          exit_code: 0,
          status: "completed",
        },
      },
      {
        type: "item.completed",
        item: {
          id: "mcp",
          type: "mcp_tool_call",
          server: "aven",
          tool: "read_file",
          arguments: { path: "a" },
          status: "completed",
        },
      },
    ]);

    expect(seen.map((event) => event.type)).toEqual(["tool_start", "tool_end"]);
  });
});
