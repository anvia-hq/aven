import { createQuestionTool, createTool } from "@anvia/core";
import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

import { answerOf, continuationOf, runCodexChat } from "./codex-run";
import { CodexThreads } from "./codex-threads";
import type { CodexChat, CodexSupport } from "./types";
import type { RunEvent } from "@aven/protocol/types";
import { parseAgentContinuation } from "@anvia/core/agent/interactions";

const root = mkdtempSync(join(tmpdir(), "codex-run-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const fake = join(import.meta.dir, "testing", "fake-codex.ts");

const readFile = createTool({
  name: "read_file",
  description: "Reads a file.",
  inputSchema: z.object({ path: z.string() }),
  execute: ({ path }) => ({ content: `contents of ${path}` }),
});

const ask = createQuestionTool({ name: "ask_user" });

let counter = 0;
function chatOf(lines: unknown[], changes: Partial<CodexChat> = {}) {
  const home = mkdtempSync(join(root, "home-"));
  const work = join(home, "work");
  const threadId = `t${counter++}`;
  const codex: CodexSupport = {
    path: fake,
    threads: new CodexThreads(join(home, "codex-threads.json")),
    env: { PATH: process.env.PATH },
    work,
  };
  const folder = join(work, threadId);
  Bun.spawnSync(["mkdir", "-p", folder]);
  writeFileSync(join(folder, "script.json"), JSON.stringify(lines));
  const events: RunEvent[] = [];
  const chat: CodexChat = {
    runId: "run-1",
    threadId,
    codex,
    prompt: "fix it",
    filed: [{ role: "user", content: "fix it" }],
    tools: [readFile, ask],
    instructions: "Be brief.",
    emit: (event) => events.push(event),
    signal: new AbortController().signal,
    ...changes,
  };
  return { chat, events, folder, codex };
}

const text = (id: string, said: string) => ({
  type: "item.completed",
  item: { id, type: "agent_message", text: said },
});

describe("runCodexChat", () => {
  test("a turn that answers ends as a response with the history to file, and its thread id is kept", async () => {
    const { chat, events, codex } = chatOf([
      { type: "thread.started", thread_id: "cx-1" },
      text("m", "Done."),
      {
        type: "turn.completed",
        usage: { input_tokens: 5, cached_input_tokens: 0, output_tokens: 1 },
      },
    ]);
    const end = await runCodexChat(chat);
    expect(end.type).toBe("response");
    expect(end.type === "response" && end.messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
    ]);
    expect(events.map((event) => event.type)).toEqual(["text", "usage"]);
    expect(codex.threads.get(chat.threadId)).toBe("cx-1");
  });

  test("the next turn on the thread resumes the Codex thread, and hands Codex the prompt and the instructions", async () => {
    const first = chatOf([{ type: "thread.started", thread_id: "cx-7" }, text("m", "ok")]);
    await runCodexChat(first.chat);
    const second = { ...first.chat, prompt: "and now this" };
    await runCodexChat(second);
    const calls = readFileSync(join(first.folder, "calls.jsonl"), "utf8").trim().split("\n");
    const last = JSON.parse(calls.at(-1)!) as { args: string[]; input: string };
    expect(last.args.slice(-2)).toEqual(["resume", "cx-7"]);
    expect(last.input).toBe("and now this");
    expect(last.args.join(" ")).toContain('developer_instructions="Be brief."');
  });

  test("a tool Codex calls through Aven's server runs, with the result back to Codex", async () => {
    const { chat, folder } = chatOf([
      { call: { tool: "read_file", args: { path: "a.txt" } } },
      text("m", "read it"),
    ]);
    const end = await runCodexChat(chat);
    expect(end.type).toBe("response");
    expect(readFileSync(join(folder, "tool-results.txt"), "utf8")).toContain("contents of a.txt");
  });

  test("a question ends the run as an interaction with a continuation the control plane can read", async () => {
    const questions = [{ id: "a", text: "Which one?" }];
    const { chat, events } = chatOf([
      { call: { tool: "ask_user", args: { questions } } },
      {
        type: "item.started",
        item: {
          id: "q",
          type: "mcp_tool_call",
          server: "aven",
          tool: "ask_user",
          arguments: { questions },
          status: "in_progress",
        },
      },
    ]);
    const end = await runCodexChat(chat);
    expect(end.type).toBe("interaction");
    if (end.type !== "interaction") return;
    const continuation = parseAgentContinuation(end.continuation);
    expect(continuation.agentId).toBe("run-run-1");
    expect(continuation.interaction).toMatchObject({
      type: "tool-question",
      toolName: "ask_user",
      questions: [{ id: "a", text: "Which one?" }],
    });
    expect(events.some((event) => event.type === "tool_end")).toBe(false);
  });

  test("a failed turn is an error and is not filed", async () => {
    const { chat, codex } = chatOf([
      { type: "thread.started", thread_id: "cx-2" },
      { type: "turn.failed", error: { message: "usage limit reached" } },
    ]);
    expect(await runCodexChat(chat)).toEqual({ type: "error", error: "usage limit reached" });
    expect(codex.threads.get(chat.threadId)).toBe("cx-2");
  });

  test("a cancelled turn is an error, and Codex is stopped", async () => {
    const controller = new AbortController();
    const { chat } = chatOf([{ type: "thread.started", thread_id: "cx-3" }, "hang"], {
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 300);
    expect(await runCodexChat(chat)).toEqual({ type: "error", error: "The run was stopped" });
  });
});

describe("a question and its answer", () => {
  const question = {
    toolName: "ask_user",
    callId: "c1",
    input: { questions: [{ id: "a", text: "Which?" }] },
  };

  test("the answer comes back to Codex as a message, and the question's tool is answered in the history", () => {
    const continuation = continuationOf("run-1", question);
    const { prompt, filed } = answerOf(continuation, {
      type: "tool-question",
      answers: [{ questionId: "a", value: "the first" }],
    });
    expect(prompt).toBe("The user answered your question:\n- Which?: the first");
    expect(filed).toEqual([
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "c1",
            toolName: "ask_user",
            output: { type: "json", value: { answers: [{ questionId: "a", value: "the first" }] } },
          },
        ],
      },
    ]);
  });

  test("an answer to a continuation it cannot read still reaches Codex, and files nothing", () => {
    const { prompt, filed } = answerOf(
      {},
      { type: "tool-question", answers: [{ questionId: "a", value: "x" }] },
    );
    expect(prompt).toContain("- a: x");
    expect(filed).toEqual([]);
  });
});
