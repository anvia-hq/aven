import { describe, expect, test } from "bun:test";
import { createTool } from "@anvia/core";
import { z } from "zod";

import { CodexToolHost, encodeFrame, createFrameReader, projectEnd } from "./codex-mcp";

const exec = createTool({
  name: "exec_command",
  description: "Run a command",
  inputSchema: z.object({ command: z.string() }),
  execute: ({ command }, context) => {
    context?.abortSignal?.throwIfAborted();
    return { status: "exited", exitCode: 0, stdout: command, stderr: "" };
  },
});

const shown = createTool({
  name: "show_artifact",
  description: "Show an artifact",
  inputSchema: z.object({}),
  execute: () => ({
    artifacts: [{ name: "shot.png", mediaType: "image/png", caption: "A shot" }],
  }),
});

function callResult(response: { result?: unknown } | undefined) {
  const result = response?.result;

  if (!result || typeof result !== "object") return { text: "", failed: true };

  const content = "content" in result && Array.isArray(result.content) ? result.content : [];
  const first = content[0];
  const text =
    first && typeof first === "object" && "text" in first && typeof first.text === "string"
      ? first.text
      : "";
  const failed = "isError" in result ? Boolean(result.isError) : false;
  return { text, failed };
}

function host() {
  const events: unknown[] = [];
  const tools = new CodexToolHost([exec, shown], {
    started: () => undefined,
    finished: (_id, _name, output) => events.push(output),
    park: async () => "red",
  });
  return { tools, events };
}

describe("the aven tool host", () => {
  test("lists a tool and runs it", async () => {
    const { tools } = host();
    const list = await tools.handle({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    const names =
      list &&
      "result" in list &&
      list.result &&
      typeof list.result === "object" &&
      "tools" in list.result
        ? (list.result.tools as { name: string }[]).map((tool) => tool.name)
        : [];
    expect(names).toContain("exec_command");

    const called = await tools.handle({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "exec_command", arguments: { command: "ls" } },
    });
    expect(callResult(called).text).toContain("ls");
    expect(callResult(called).failed).toBe(false);
  });

  test("an aborted command comes back as an error", async () => {
    const { tools } = host();
    tools.bind(AbortSignal.abort(new Error("stopped")));
    const called = await tools.handle({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "exec_command", arguments: { command: "sleep" } },
    });
    expect(callResult(called).failed).toBe(true);
    expect(callResult(called).text).toContain("stopped");
  });

  test("show_artifact keeps the artifact on the tool result", async () => {
    const { tools, events } = host();
    const called = await tools.handle({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "show_artifact", arguments: {} },
    });
    const end = projectEnd("1", "show_artifact", events[0] as never);
    expect(callResult(called).failed).toBe(false);
    expect(end.artifacts).toEqual([
      { name: "shot.png", mediaType: "image/png", caption: "A shot" },
    ]);
  });

  test("frames a message the reader can take apart", () => {
    const frame = encodeFrame({ jsonrpc: "2.0", id: 1, method: "initialize" });
    const seen: unknown[] = [];
    const read = createFrameReader((message) => seen.push(message));
    read(frame);
    expect(seen).toEqual([{ jsonrpc: "2.0", id: 1, method: "initialize" }]);
  });
});
