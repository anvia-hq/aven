import { expect, test } from "bun:test";

import type { ChatMessage, ToolPart } from "@/modules/threads/types";

import { finishedEnvironmentSaves } from "./environment-saves";

function tool(name: string, status: ToolPart["status"]): ToolPart {
  return { id: `${name}-${status}`, name, target: "", status };
}

function message(...tools: ToolPart[]): ChatMessage {
  return { id: "m", role: "assistant", parts: tools.map((part) => ({ type: "tool", tool: part })) };
}

test("counts the saves of the environment that have ended, and not the one still running", () => {
  const messages = [
    message(tool("save_environment", "done"), tool("exec_command", "done")),
    message(tool("save_environment", "error"), tool("save_environment", "running")),
  ];
  expect(finishedEnvironmentSaves(messages)).toBe(2);
});

test("a thread that never saved an environment counts none", () => {
  expect(finishedEnvironmentSaves([message(tool("exec_command", "done"))])).toBe(0);
});
