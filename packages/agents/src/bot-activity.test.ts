import { describe, expect, test } from "bun:test";

import { activityLabelOf } from "./bot-activity";

describe("activityLabelOf", () => {
  test("says what a known tool does, without its arguments", () => {
    expect(activityLabelOf("exec_command", { command: "cat ~/.ssh/id_rsa" })).toBe(
      "Running a command",
    );
    expect(activityLabelOf("start_thread", { prompt: "secret plans" })).toBe("Starting a thread");
  });

  test("names the file a file tool works on, not its folder", () => {
    expect(activityLabelOf("read_file", { path: "/workspace/src/app.ts" })).toBe("Reading app.ts");
    expect(activityLabelOf("edit", { path: "/workspace/notes.md" })).toBe("Editing notes.md");
    expect(activityLabelOf("write_file", {})).toBe("Writing a file");
    expect(activityLabelOf("read_file", { path: 3 })).toBe("Reading a file");
  });

  test("makes a short label of the name of a tool it does not know, such as an MCP one", () => {
    expect(activityLabelOf("github__search_issues")).toBe("Using github search issues");
    expect(activityLabelOf("___")).toBe("Using a tool");
  });

  test("keeps a label short", () => {
    expect(activityLabelOf("read_file", { path: `/a/${"x".repeat(200)}.ts` }).length).toBeLessThan(
      62,
    );
    expect(activityLabelOf("a".repeat(200)).length).toBeLessThan(62);
  });
});
