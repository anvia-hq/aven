import { describe, expect, test } from "bun:test";

import type { ChatMessage } from "@aven/protocol/types";

import { threadMarkdown } from "./export";

describe("threadMarkdown", () => {
  test("writes just the title when the thread has no messages", () => {
    expect(threadMarkdown("Fix the export button", [])).toBe("# Fix the export button\n");
  });

  test("writes every part and attachment of a thread", () => {
    const messages: ChatMessage[] = [
      { id: "m-1", role: "user", parts: [{ type: "text", text: "  Export this thread  " }] },
      {
        id: "m-2",
        role: "assistant",
        parts: [
          { type: "text", text: "Here is the plan" },
          { type: "reasoning", text: "Think it through" },
          {
            type: "tool",
            tool: { id: "t-1", name: "bash", target: "bun test", status: "done" },
          },
        ],
        attachments: [{ name: "trace.log", mediaType: "text/plain", size: 12 }],
      },
    ];

    expect(threadMarkdown("Fix the export button", messages)).toBe(
      [
        "# Fix the export button",
        "",
        "## User",
        "",
        "Export this thread",
        "",
        "## Assistant",
        "",
        "Here is the plan",
        "",
        "<details>",
        "<summary>Reasoning</summary>",
        "",
        "Think it through",
        "</details>",
        "",
        "- `bash` bun test (done)",
        "- Attached: trace.log (text/plain)",
        "",
      ].join("\n"),
    );
  });
});
