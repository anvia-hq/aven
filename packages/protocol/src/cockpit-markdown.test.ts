import { describe, expect, test } from "bun:test";

import { cockpitMarkdown } from "./cockpit-markdown";

const text = (value: string, styles = {}) => ({ type: "text", text: value, styles });
const block = (type: string, content: unknown = [], children: unknown[] = [], props = {}) => ({
  type,
  props,
  content,
  children,
});
const doc = (...blocks: unknown[]) => JSON.stringify(blocks);

describe("cockpitMarkdown", () => {
  test("text that is not BlockNote's is kept as it is", () => {
    expect(cockpitMarkdown("# Plan\n\n- a")).toBe("# Plan\n\n- a");
    expect(cockpitMarkdown("[1, 2, 3]")).toBe("[1, 2, 3]");
    expect(cockpitMarkdown("[link](https://x.dev) first")).toBe("[link](https://x.dev) first");
  });

  test("a list's items are one after another, and its children stay inside it", () => {
    const body = doc(
      block(
        "numberedListItem",
        [text("First")],
        [
          block("bulletListItem", [text("inner")]),
          block("codeBlock", [text("a\nb")], [], { language: "ts" }),
        ],
      ),
      block("numberedListItem", [text("Second")]),
      block("paragraph", [text("After")]),
    );
    expect(cockpitMarkdown(body)).toBe(
      "1. First\n   - inner\n\n   ```ts\n   a\n   b\n   ```\n2. Second\n\nAfter",
    );
  });

  test("a numbered list counts on from its start, and a divider is a rule", () => {
    const body = doc(
      block("numberedListItem", [text("five")], [], { start: 5 }),
      block("numberedListItem", [text("six")]),
      block("divider", undefined),
      block("checkListItem", [text("done")], [], { checked: true }),
    );
    expect(cockpitMarkdown(body)).toBe("5. five\n6. six\n\n---\n\n- [x] done");
  });

  test("code with backticks stays code, and styles hug their words", () => {
    const body = doc(
      block("paragraph", [
        text("a`b", { code: true }),
        text(" and "),
        text("bold ", { bold: true }),
        text("next"),
      ]),
      block("codeBlock", [text("```\nnested\n```")]),
    );
    expect(cockpitMarkdown(body)).toBe("``a`b`` and **bold** next\n\n````\n```\nnested\n```\n````");
  });

  test("a table's cells are one line each", () => {
    const body = doc(
      block("table", {
        type: "tableContent",
        rows: [
          { cells: [{ type: "tableCell", content: [text("a\nb")] }, [text("c|d")]] },
          { cells: [[text("1")], [text("2")]] },
        ],
      }),
    );
    expect(cockpitMarkdown(body)).toBe("| a b | c\\|d |\n| --- | --- |\n| 1 | 2 |");
  });
});
