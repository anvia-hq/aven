import { describe, expect, test } from "bun:test";
import type { CockpitCommand } from "@aven/protocol/cockpit";

import { createCockpitTool } from "./cockpit";

type Input = Record<string, unknown>;
const call = (tool: ReturnType<typeof createCockpitTool>, input: Input) =>
  tool.call(input as Parameters<typeof tool.call>[0]);

describe("cockpit", () => {
  test("a bot's tool names the command and only the fields given", async () => {
    const asked: CockpitCommand[] = [];
    const tool = createCockpitTool(async (command) => (asked.push(command), "ok"), "write");
    await call(tool, {
      command: "create",
      kind: "tasks",
      title: "Ship",
      body: "- [ ] CI",
      due_date: "2026-12-01",
    });
    await call(tool, { command: "update", kind: "notes", id: "n1", pinned: true });
    expect(asked).toEqual([
      {
        command: "create",
        kind: "tasks",
        fields: { title: "Ship", body: "- [ ] CI", dueDate: "2026-12-01" },
      },
      { command: "update", kind: "notes", id: "n1", fields: { pinned: true } },
    ]);
  });

  test("a thread's tool only reads: a write is refused before the host is asked", async () => {
    const asked: CockpitCommand[] = [];
    const tool = createCockpitTool(async (command) => (asked.push(command), "ok"), "read");
    expect(await call(tool, { command: "list", kind: "inbox", tag: "work" })).toBe("ok");
    await expect(call(tool, { command: "create", kind: "inbox", title: "x" })).rejects.toThrow();
    await expect(call(tool, { command: "delete", kind: "inbox", id: "i1" })).rejects.toThrow();
    expect(asked).toEqual([{ command: "list", kind: "inbox", tag: "work" }]);
    const definition = JSON.stringify(await tool.definition(""));
    expect(definition).toContain("only read");
    expect(definition).not.toContain('"body"');
  });

  test("a command without what it needs is refused before the host is asked", async () => {
    const tool = createCockpitTool(async () => "ok", "write");
    await expect(call(tool, { command: "get", kind: "notes" })).rejects.toThrow("get needs id");
  });
});
