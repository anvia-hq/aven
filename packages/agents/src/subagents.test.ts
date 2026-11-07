import { describe, expect, test } from "bun:test";
import { createTool, type AnyTool } from "@anvia/core";
import { z } from "zod";

import { SANDBOX_TOOL_NAMES } from "./sandbox-tools";
import { subagentInstructions } from "./subagent-instruction";
import { SUBAGENT_TYPES, subagentTools } from "./subagents";

const named = (name: string): AnyTool =>
  createTool({
    name,
    description: name,
    inputSchema: z.object({}),
    execute: () => name,
  });

const parentTools = [
  ...SANDBOX_TOOL_NAMES,
  "edit",
  "show_artifact",
  "git_fetch",
  "define_goal",
  "save_environment",
  "spawn_agent",
  "ask_user",
  "request_secret",
].map(named);
const namesFor = (type: (typeof SUBAGENT_TYPES)[number]) =>
  subagentTools(type, parentTools).map((tool) => tool.name);

describe("subagentTools", () => {
  test("an explorer has the reading tools and nothing that writes", () => {
    expect(namesFor("explore")).toEqual([
      "exec_command",
      "read_file",
      "list_files",
      "list_ports",
      "list_processes",
      "read_process_logs",
    ]);
  });

  test("a general subagent has the working tools", () => {
    const names = namesFor("general");
    expect(names).toEqual(
      expect.arrayContaining(["exec_command", "write_file", "edit", "git_fetch"]),
    );
    expect(names).toEqual(expect.arrayContaining(["start_process", "stop_process"]));
  });

  test.each(SUBAGENT_TYPES)("a %s subagent cannot ask, take a goal, show or spawn", (type) => {
    const names = namesFor(type);
    for (const forbidden of [
      "ask_user",
      "request_secret",
      "define_goal",
      "save_environment",
      "show_artifact",
      "spawn_agent",
    ])
      expect(names).not.toContain(forbidden);
  });
});

describe("subagentInstructions", () => {
  test.each(SUBAGENT_TYPES)(
    "every tag in a %s subagent's instructions is closed and named once",
    (type) => {
      const text = subagentInstructions(type);
      const opens = [...text.matchAll(/^<([a-z_]+)>$/gm)].map((match) => match[1]);
      const closes = [...text.matchAll(/^<\/([a-z_]+)>$/gm)].map((match) => match[1]);
      expect(closes).toEqual(opens);
      expect(new Set(opens).size).toBe(opens.length);
    },
  );

  test("an explorer is told to only read, a general subagent is not", () => {
    expect(subagentInstructions("explore")).toContain("do not create, edit or delete files");
    expect(subagentInstructions("general")).not.toContain("do not create, edit or delete files");
  });
});
