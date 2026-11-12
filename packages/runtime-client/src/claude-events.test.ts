import { describe, expect, test } from "bun:test";

import { ClaudeTurn } from "./claude-events";

const TOKEN = "setup-token-should-never-leak-0001";

const redact = (text: string) => text.replaceAll(TOKEN, "[redacted]");

describe("Claude stream events become thread events", () => {
  test("maps text, thinking, a tool call, its result and usage", () => {
    const turn = new ClaudeTurn(redact);
    const events = [
      ...turn.take({
        type: "stream_event",
        session_id: "sess-1",
        event: { type: "content_block_delta", delta: { type: "text_delta", text: "Hel" } },
      }),
      ...turn.take({
        type: "stream_event",
        event: { type: "content_block_delta", delta: { type: "text_delta", text: "lo" } },
      }),
      ...turn.take({
        type: "assistant",
        session_id: "sess-1",
        message: {
          content: [
            { type: "text", text: "Hello" },
            { type: "thinking", thinking: "a thought" },
            {
              type: "tool_use",
              id: "call-1",
              name: "mcp__aven__memory",
              input: { command: "view", path: "notes.md" },
            },
          ],
        },
      }),
      ...turn.take({
        type: "user",
        message: {
          content: [{ type: "tool_result", tool_use_id: "call-1", content: `saw ${TOKEN}` }],
        },
      }),
      ...turn.take({
        type: "result",
        subtype: "success",
        session_id: "sess-1",
        usage: { input_tokens: 3, output_tokens: 2, cache_read_input_tokens: 1 },
      }),
    ];

    expect(events).toEqual([
      { type: "text", delta: "Hel" },
      { type: "text", delta: "lo" },
      { type: "reasoning", delta: "a thought" },
      {
        type: "tool_start",
        tool: { id: "call-1", name: "memory", target: "view", status: "running" },
      },
      { type: "tool_end", id: "call-1", status: "done", output: "saw [redacted]" },
      {
        type: "usage",
        turn: { inputTokens: 3, outputTokens: 2, cacheWriteTokens: 0, cacheReadTokens: 1 },
      },
    ]);
    expect(turn.sessionId).toBe("sess-1");
    expect(JSON.stringify(events)).not.toContain(TOKEN);
    const filed = turn.messages("please look");
    expect(filed.map((message) => message.role)).toEqual(["user", "assistant", "tool"]);
    expect(JSON.stringify(filed)).not.toContain(TOKEN);
    expect(JSON.stringify(filed)).toContain("Hello");
  });

  test("does not repeat text that was already streamed", () => {
    const turn = new ClaudeTurn();
    turn.take({
      type: "stream_event",
      event: { type: "content_block_delta", delta: { type: "text_delta", text: "Once" } },
    });
    const again = turn.take({
      type: "assistant",
      message: { content: [{ type: "text", text: "Once" }] },
    });
    expect(again).toEqual([]);
    expect(turn.messages("go").filter((message) => message.role === "assistant")).toHaveLength(1);
  });

  test("a failed result is an error, and the setup token is not in it", () => {
    const turn = new ClaudeTurn(redact);
    const events = turn.take({
      type: "result",
      subtype: "error_during_execution",
      errors: [`rejected ${TOKEN}`],
    });
    expect(events).toEqual([]);
    expect(turn.error).toBe("rejected [redacted]");
    expect(turn.error).not.toContain(TOKEN);
  });

  test("a shown page or video rides on the artifact tool result", () => {
    const turn = new ClaudeTurn();
    turn.take({
      type: "assistant",
      message: {
        content: [
          {
            type: "tool_use",
            id: "art",
            name: "mcp__aven__show_artifact",
            input: { paths: ["page.html"] },
          },
        ],
      },
    });
    turn.queueArtifacts([
      { name: "page.html", mediaType: "text/html" },
      { name: "clip.mp4", mediaType: "video/mp4" },
    ]);
    expect(
      turn.take({
        type: "user",
        message: { content: [{ type: "tool_result", tool_use_id: "art", content: "shown" }] },
      }),
    ).toEqual([
      {
        type: "tool_end",
        id: "art",
        status: "done",
        output: "shown",
        artifacts: [
          { name: "page.html", mediaType: "text/html" },
          { name: "clip.mp4", mediaType: "video/mp4" },
        ],
      },
    ]);
  });

  test("an authentication failure tells the person to replace the token", () => {
    const turn = new ClaudeTurn();
    turn.take({ type: "assistant", error: "authentication_failed", message: { content: [] } });
    expect(turn.error).toBe("The Claude setup token was rejected. Replace it in Settings.");
  });
});
