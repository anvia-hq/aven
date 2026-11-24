import { describe, expect, test } from "bun:test";

import { latestPlanOf, liveStepOf, projectTimeline, proofOf } from "./timeline";
import type { ChatMessage, MessagePart, ToolPart } from "./types";

const tool = (overrides: Partial<ToolPart>): ToolPart => ({
  id: "t1",
  name: "exec_command",
  target: "",
  status: "done",
  ...overrides,
});

describe("projectTimeline", () => {
  test("groups consecutive exploration calls into one quiet step", () => {
    const items = projectTimeline([
      { type: "tool", tool: tool({ id: "r1", name: "read_file", target: "src/a.ts" }) },
      { type: "tool", tool: tool({ id: "r2", name: "read_file", target: "src/b.ts" }) },
      { type: "tool", tool: tool({ id: "g1", name: "grep", target: "export" }) },
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      icon: "search",
      label: "Explored 2 files and searched codebase",
      running: false,
    });
    expect(items[0]?.tools).toHaveLength(3);
  });

  test("does not coalesce unnarrated reads into a narrated exploration item", () => {
    const items = projectTimeline(
      [
        {
          type: "tool",
          tool: tool({ id: "r1", name: "read_file", target: "missing.ts", status: "error" }),
        },
        { type: "tool", tool: tool({ id: "r2", name: "read_file", target: "src/a.ts" }) },
      ],
      {
        r1: {
          toolId: "r1",
          label: "Checked missing.ts",
          outcome: "File not found",
          tone: "error",
        },
      },
    );

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      label: "Checked missing.ts",
      outcome: { label: "File not found", tone: "error" },
    });
    expect(items[1]).toMatchObject({ label: "Explored src/a.ts" });
  });

  test("coalesces sequential clean edits to the same file and keeps failed edits separate", () => {
    const items = projectTimeline([
      {
        type: "tool",
        tool: tool({
          id: "e1",
          name: "edit",
          target: "src/dashboard/export.ts",
          diff: [
            { type: "del", text: "old" },
            { type: "add", text: "new 1" },
            { type: "add", text: "new 2" },
          ],
        }),
      },
      {
        type: "tool",
        tool: tool({
          id: "e2",
          name: "edit",
          target: "src/dashboard/export.ts",
          diff: [{ type: "add", text: "new 3" }],
        }),
      },
      {
        type: "tool",
        tool: tool({
          id: "e3",
          name: "edit",
          target: "src/dashboard/export.ts",
          status: "error",
          output: "Error: target text not found",
        }),
      },
    ]);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      icon: "file",
      label: "Patched dashboard/export.ts",
      stat: { additions: 3, deletions: 1 },
    });
    expect(items[1]).toMatchObject({
      icon: "file",
      tone: "error",
      outcome: { label: "Error: target text not found", tone: "error" },
    });
  });

  test("does not merge an unnarrated edit into a narrated edit row", () => {
    const items = projectTimeline(
      [
        { type: "tool", tool: tool({ id: "e1", name: "edit", target: "src/a.ts" }) },
        {
          type: "tool",
          tool: tool({ id: "e2", name: "edit", target: "src/a.ts", status: "running" }),
        },
      ],
      {
        e1: {
          toolId: "e1",
          label: "Added null guard",
          outcome: "Guarded export handler",
          tone: "success",
        },
      },
    );

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      label: "Added null guard",
      outcome: { label: "Guarded export handler", tone: "success" },
    });
    expect(items[1]).toMatchObject({ label: "Patching src/a.ts", running: true });
  });

  test("parses test runner commands into action and verified outcome", () => {
    const items = projectTimeline([
      {
        type: "tool",
        tool: tool({
          id: "t1",
          name: "exec_command",
          target: "bun test packages/protocol",
          status: "done",
          output: "84 pass\n0 fail\nRan 84 tests across 5 files.",
        }),
      },
    ]);

    expect(items[0]).toMatchObject({
      icon: "test",
      label: "Running tests",
      outcome: { icon: "check", label: "84/84 passed", tone: "success" },
    });
  });

  test("extracts error lines, PR numbers, and gh pr checks states", () => {
    const items = projectTimeline([
      {
        type: "tool",
        tool: tool({
          id: "c1",
          name: "exec_command",
          target: "bun run export.ts",
          status: "error",
          output: "Uncaught TypeError: Cannot read properties of null\n[exit 1]",
        }),
      },
      {
        type: "tool",
        tool: tool({
          id: "pr1",
          name: "exec_command",
          target: "gh pr create --fill",
          status: "done",
          output: "https://github.com/acme/app/pull/3201",
        }),
      },
      {
        type: "tool",
        tool: tool({
          id: "ci1",
          name: "exec_command",
          target: "gh pr checks 3201",
          status: "done",
          output: "tests\tpass\t1m20s",
        }),
      },
      {
        type: "tool",
        tool: tool({
          id: "ci2",
          name: "exec_command",
          target: "gh pr checks 3201",
          status: "done",
          output: "lint\tfail\t12s",
        }),
      },
      {
        type: "tool",
        tool: tool({
          id: "ci3",
          name: "exec_command",
          target: "gh pr checks 3201",
          status: "done",
          output: "build\tpending\t0s",
        }),
      },
    ]);

    expect(items[0]?.outcome).toMatchObject({
      icon: "warning",
      label: "Uncaught TypeError: Cannot read properties of null",
      tone: "error",
    });
    expect(items[1]).toMatchObject({ icon: "pr", label: "Opened PR #3201" });
    expect(items[2]?.outcome).toMatchObject({ label: "CI passing", tone: "success" });
    expect(items[3]?.outcome).toMatchObject({ label: "CI failing", tone: "error" });
    expect(items[4]?.outcome).toBeUndefined();
  });

  test("uses present participle for running todo_write", () => {
    const items = projectTimeline([
      {
        type: "tool",
        tool: tool({ id: "td1", name: "todo_write", target: "1/3 done", status: "running" }),
      },
    ]);
    expect(items[0]).toMatchObject({ icon: "task", label: "Updating plan (1/3 done)" });
  });

  test("applies sidecar narration overrides when present", () => {
    const items = projectTimeline(
      [
        {
          type: "tool",
          tool: tool({ id: "e1", name: "edit", target: "dashboard/export.ts" }),
        },
      ],
      {
        e1: {
          toolId: "e1",
          label: "Patching dashboard/export.ts",
          outcome: "Added null check in PDF renderer",
          icon: "file",
          tone: "success",
        },
      },
    );

    expect(items[0]).toMatchObject({
      label: "Patching dashboard/export.ts",
      outcome: { icon: "check", label: "Added null check in PDF renderer", tone: "success" },
    });
  });
});

describe("liveStepOf", () => {
  test("returns the active semantic step for running tools, subagents, and trailing reasoning", () => {
    const testMessages: ChatMessage[] = [
      {
        id: "m-0",
        role: "assistant",
        parts: [
          {
            type: "tool",
            tool: tool({ id: "t1", name: "exec_command", target: "bun test", status: "running" }),
          },
        ],
      },
    ];
    expect(liveStepOf(testMessages)).toEqual({ icon: "test", label: "Running tests" });

    const subagentMessages: ChatMessage[] = [
      {
        id: "m-1",
        role: "assistant",
        parts: [
          {
            type: "tool",
            tool: tool({
              id: "s1",
              name: "subagent",
              status: "running",
              subagents: [
                {
                  index: 0,
                  type: "research",
                  description: "Inspect auth middleware",
                  status: "running",
                  tools: [],
                },
              ],
            }),
          },
        ],
      },
    ];
    expect(liveStepOf(subagentMessages)).toEqual({
      icon: "sparkles",
      label: "Inspect auth middleware",
    });

    const reasoningMessages: ChatMessage[] = [
      {
        id: "m-2",
        role: "assistant",
        parts: [{ type: "reasoning", text: "Comparing two options" }],
      },
    ];
    expect(liveStepOf(reasoningMessages)).toEqual({ icon: "sparkles", label: "Thinking" });
  });
});

describe("latestPlanOf and proofOf", () => {
  test("extracts latest plan tasks from native bracket format and Codex format, and handles clear", () => {
    const nativeParts: MessagePart[] = [
      {
        type: "tool",
        tool: tool({
          id: "td1",
          name: "todo_write",
          target: "1/3 done",
          output: "Task list (1/3 done):\n[x] Reproduce crash\n[~] Patch exporter\n[ ] Run tests",
        }),
      },
    ];
    expect(latestPlanOf(nativeParts)).toEqual([
      { status: "completed", content: "Reproduce crash" },
      { status: "in_progress", content: "Patch exporter" },
      { status: "pending", content: "Run tests" },
    ]);

    const codexParts: MessagePart[] = [
      {
        type: "tool",
        tool: tool({
          id: "td2",
          name: "todo_write",
          output: "x Reproduce crash\n  Patch exporter",
        }),
      },
    ];
    expect(latestPlanOf(codexParts)).toEqual([
      { status: "completed", content: "Reproduce crash" },
      { status: "pending", content: "Patch exporter" },
    ]);

    const clearedParts: MessagePart[] = [
      ...nativeParts,
      {
        type: "tool",
        tool: tool({ id: "td3", name: "todo_write", output: "Task list cleared." }),
      },
    ];
    expect(latestPlanOf(clearedParts)).toBeNull();
  });

  test("collects changed files and keeps only the latest check outcome per category", () => {
    const parts: MessagePart[] = [
      {
        type: "tool",
        tool: tool({
          id: "t-fail",
          name: "exec_command",
          target: "bun test",
          status: "error",
          output: "1 fail\n3 pass",
        }),
      },
      {
        type: "tool",
        tool: tool({
          id: "e1",
          name: "edit",
          target: "src/a.ts",
          diff: [{ type: "add", text: "line" }],
        }),
      },
      {
        type: "tool",
        tool: tool({
          id: "t-pass",
          name: "exec_command",
          target: "bun test",
          status: "done",
          output: "4 pass\n0 fail",
        }),
      },
      {
        type: "tool",
        tool: tool({
          id: "tc1",
          name: "exec_command",
          target: "bun run typecheck",
          status: "done",
          output: "",
        }),
      },
    ];
    expect(proofOf(parts)).toEqual({
      checks: [
        { id: "t-pass", label: "4/4 passed", status: "pass", detail: "bun test" },
        { id: "tc1", label: "Typecheck clean", status: "pass", detail: "bun run typecheck" },
      ],
      files: [{ path: "src/a.ts", additions: 1, deletions: 0 }],
    });
  });
});
