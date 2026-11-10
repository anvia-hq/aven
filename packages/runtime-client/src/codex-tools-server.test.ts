import { createQuestionTool, createTool } from "@anvia/core";
import { afterEach, describe, expect, test } from "bun:test";
import { z } from "zod";

import { serveCodexTools, toolResult } from "./codex-tools-server";
import { connectMcpServers } from "./mcp-servers";
import type { CodexQuestion } from "./types";

const readFile = createTool({
  name: "read_file",
  description: "Reads a file.",
  inputSchema: z.object({ path: z.string() }),
  execute: ({ path }) => {
    if (path === "missing.txt") throw new Error("File not found: missing.txt");
    return { content: `contents of ${path}`, truncated: false };
  },
});

const echo = createTool({
  name: "echo",
  description: "Says it back.",
  inputSchema: z.object({ text: z.string() }),
  execute: ({ text }) => `said ${text}`,
});

const open: { close(): Promise<void> }[] = [];
afterEach(async () => {
  await Promise.all(open.splice(0).map((item) => item.close()));
});

async function served(question?: (question: CodexQuestion) => void) {
  const server = await serveCodexTools({
    tools: [readFile, echo, createQuestionTool({ name: "ask_user" })],
    question,
  });
  open.push(server);
  const connected = await connectMcpServers([
    {
      id: "11111111-1111-4111-8111-111111111111",
      name: "aven",
      url: server.url,
      headers: { authorization: `Bearer ${server.token}` },
      allowLocal: true,
    },
  ]);
  open.push(connected);
  const call = async (name: string, args: unknown) => {
    const tool = connected.tools.find((candidate) => candidate.name === `aven_${name}`)!;
    return tool.call(args, {});
  };
  return { server, connected, call };
}

describe("serveCodexTools", () => {
  test("offers each of Aven's tools with its description and its parameters", async () => {
    const { connected } = await served();
    expect(connected.results.every((result) => !result.error)).toBe(true);
    const names = connected.tools.map((tool) => tool.name).sort();
    expect(names).toEqual(["aven_ask_user", "aven_echo", "aven_read_file"]);
    const definition = await connected.tools
      .find((tool) => tool.name === "aven_read_file")!
      .definition("");
    expect(definition.description).toBe("Reads a file.");
    expect(JSON.stringify(definition.parameters)).toContain("path");
  });

  test("a call runs the tool and gives back what it returned", async () => {
    const { call } = await served();
    expect(JSON.stringify(await call("read_file", { path: "a.txt" }))).toContain(
      "contents of a.txt",
    );
    expect(JSON.stringify(await call("echo", { text: "hi" }))).toContain("said hi");
  });

  test("a tool that throws comes back flagged as an error, with its message, not as a broken call", async () => {
    const { call } = await served();
    await expect(call("read_file", { path: "missing.txt" })).rejects.toThrow(
      "File not found: missing.txt",
    );
  });

  test("a question is passed on, is not run, and the model is told the answer comes later", async () => {
    const asked: CodexQuestion[] = [];
    const { call } = await served((question) => asked.push(question));
    const questions = [{ id: "a", text: "Which?" }];
    const result = await call("ask_user", { questions });
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatchObject({ toolName: "ask_user", input: { questions } });
    expect(JSON.stringify(result)).toContain("answer will come as the next message");
  });

  test("a request without the run's token is refused", async () => {
    const { server } = await served();
    const bare = await fetch(server.url, { method: "POST", body: "{}" });
    const wrong = await fetch(server.url, {
      method: "POST",
      body: "{}",
      headers: { authorization: "Bearer nope" },
    });
    expect([bare.status, wrong.status]).toEqual([401, 401]);
  });

  test("each server has a token of its own and listens on the loopback only", async () => {
    const first = await served();
    const second = await served();
    expect(first.server.token).not.toBe(second.server.token);
    expect(first.server.url.startsWith("http://127.0.0.1:")).toBe(true);
  });
});

describe("toolResult", () => {
  test("text is text, an object is kept as structured content, and errors are errors", () => {
    expect(toolResult("hi")).toEqual({ content: [{ type: "text", text: "hi" }] });
    expect(toolResult({ a: 1 })).toEqual({
      content: [{ type: "text", text: '{"a":1}' }],
      structuredContent: { a: 1 },
    });
    expect(toolResult([1, 2]).structuredContent).toBeUndefined();
  });
});
