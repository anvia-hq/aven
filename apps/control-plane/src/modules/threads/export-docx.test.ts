import { describe, expect, test } from "bun:test";

import type { ChatMessage } from "@aven/protocol/types";
import { strFromU8, unzipSync } from "fflate";

import { threadDocx } from "./export-docx";

function parts(bytes: Uint8Array) {
  const files = unzipSync(bytes);
  return {
    names: Object.keys(files).sort(),
    document: strFromU8(files["word/document.xml"] ?? new Uint8Array()),
    styles: strFromU8(files["word/styles.xml"] ?? new Uint8Array()),
  };
}

describe("threadDocx", () => {
  test("writes a docx package with the transcript", () => {
    const messages: ChatMessage[] = [
      { id: "m-1", role: "user", parts: [{ type: "text", text: "One & two <three>" }] },
      {
        id: "m-2",
        role: "assistant",
        parts: [
          { type: "reasoning", text: "Think it through" },
          { type: "tool", tool: { id: "t-1", name: "bash", target: "bun test", status: "done" } },
        ],
        attachments: [{ name: "trace.log", mediaType: "text/plain", size: 12 }],
      },
    ];

    const { names, document, styles } = parts(threadDocx("A & B", messages));

    expect(names).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "word/_rels/document.xml.rels",
      "word/document.xml",
      "word/styles.xml",
    ]);
    expect(document).toContain("A &amp; B");
    expect(document).toContain("One &amp; two &lt;three&gt;");
    expect(document).toContain("User");
    expect(document).toContain("Think it through");
    expect(document).toContain("Attached: trace.log (text/plain)");
    expect(styles).toContain("Reasoning");
  });

  test("keeps the lines of a message apart", () => {
    const messages: ChatMessage[] = [
      { id: "m-1", role: "user", parts: [{ type: "text", text: "first\nsecond" }] },
    ];

    expect(parts(threadDocx("Lines", messages)).document).toContain("<w:br/>");
  });

  test("writes a title alone for a thread with no messages", () => {
    const { document } = parts(threadDocx("Empty", []));

    expect(document).toContain("Empty");
    expect(document).toContain("<w:body>");
  });
});
