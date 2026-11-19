import { describe, expect, test } from "bun:test";

import type { ChatMessage } from "@aven/protocol/types";

import { threadHtml, threadMarkdown, threadText } from "./export";

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

describe("threadText", () => {
  test("writes the title, roles, reasoning and bullets", () => {
    const messages: ChatMessage[] = [
      { id: "m-1", role: "user", parts: [{ type: "text", text: "  Export this thread  " }] },
      {
        id: "m-2",
        role: "assistant",
        parts: [
          { type: "text", text: "Here is the plan" },
          { type: "reasoning", text: "Think it through" },
          { type: "tool", tool: { id: "t-1", name: "bash", target: "bun test", status: "done" } },
        ],
        attachments: [{ name: "trace.log", mediaType: "text/plain", size: 12 }],
      },
      { id: "m-3", role: "assistant", parts: [{ type: "text", text: "   " }] },
    ];

    expect(threadText("Fix the export button", messages)).toBe(
      [
        "Fix the export button",
        "",
        "User",
        "",
        "Export this thread",
        "",
        "Assistant",
        "",
        "Here is the plan",
        "",
        "Reasoning:",
        "Think it through",
        "",
        "- bash bun test (done)",
        "- Attached: trace.log (text/plain)",
        "",
      ].join("\n"),
    );
  });

  test("writes just the title when the thread has no messages", () => {
    expect(threadText("Fix the export button", [])).toBe("Fix the export button\n");
  });
});

describe("threadHtml", () => {
  test("escapes the title and the message text", () => {
    const messages: ChatMessage[] = [
      {
        id: "m-1",
        role: "user",
        parts: [{ type: "text", text: "<script>alert(1)</script>\nsecond line" }],
      },
      { id: "m-2", role: "assistant", parts: [{ type: "reasoning", text: "Think it through" }] },
    ];

    const html = threadHtml("A & B", messages);

    expect(html).toContain("<!doctype html>");
    expect(html).toContain("<title>A &amp; B</title>");
    expect(html).toContain("<h1>A &amp; B</h1>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;<br/>second line");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain(
      '<section class="reasoning"><h3>Reasoning</h3><p>Think it through</p></section>',
    );
    expect(html).toContain("window.print()");
  });

  test("is a whole page for a thread with no messages", () => {
    const html = threadHtml("Empty", []);

    expect(html).toContain("<h1>Empty</h1>");
    expect(html).toContain("@page");
  });
});
