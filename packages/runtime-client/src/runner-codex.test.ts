import { createTool, type AnyTool } from "@anvia/core";
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

import { CodexThreads } from "./codex-threads";
import { startRuntime } from "./runner";
import { fakeControlPlane } from "./testing/fake-control-plane";
import { journalPath } from "./testing/journal-path";
import { noProcesses } from "./thread-processes";
import type { CodexSupport, ThreadSandbox, ThreadWorkspaces } from "./types";

const fake = join(import.meta.dir, "testing", "fake-codex.ts");

const readFile = createTool({
  name: "read_file",
  description: "Reads a file.",
  inputSchema: z.object({ path: z.string() }),
  execute: ({ path }) => ({ content: `contents of ${path}` }),
});

const sandbox = (tools: AnyTool[] = [readFile]): ThreadWorkspaces => ({
  async acquire(): Promise<ThreadSandbox> {
    return { tools, hasRunningProcesses: async () => false, processes: noProcesses };
  },
  desktop: () => undefined,
  workspace: async () => undefined,
  async release() {},
  async dispose() {},
});

const thread = { id: "thread-1", organizationId: "org-1" };
const start = (changes: Record<string, unknown> = {}) => ({
  type: "run.start",
  runId: "run-1",
  thread,
  prompt: "fix it",
  codex: { modelId: "gpt-5", reasoningEffort: "high" },
  ...changes,
});

const until = async (condition: () => boolean) => {
  for (let i = 0; i < 200 && !condition(); i++) await Bun.sleep(20);
  expect(condition()).toBe(true);
};

const cleanups: (() => unknown)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

function connect(withCodex = true, path = fake) {
  const home = mkdtempSync(join(tmpdir(), "runner-codex-"));
  const codex: CodexSupport | undefined = withCodex
    ? {
        path,
        threads: new CodexThreads(join(home, "codex-threads.json")),
        env: { PATH: process.env.PATH, CODEX_HOME: home },
        work: join(home, "work"),
      }
    : undefined;
  const plane = fakeControlPlane();
  const runtime = startRuntime({
    url: plane.url,
    token: "t",
    journalPath: journalPath(),
    sandbox: sandbox(),
    codex,
    typingPause: async () => undefined,
  });
  cleanups.push(
    () => runtime.stop(),
    plane.stop,
    () => rmSync(home, { recursive: true, force: true }),
  );
  const script = (lines: unknown[]) => {
    const folder = join(home, "work", thread.id);
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, "script.json"), JSON.stringify(lines));
    return folder;
  };
  return { plane, runtime, script, home };
}

const ended = (plane: ReturnType<typeof fakeControlPlane>) =>
  plane.received.filter((message) => message.type === "run.end");
const filed = (plane: ReturnType<typeof fakeControlPlane>) =>
  plane.received.flatMap((message) =>
    message.type === "call" && message.method === "memory.append"
      ? [message.params as { turn: number; messages: { role: string }[] }]
      : [],
  );

const said = (id: string, text: string) => ({
  type: "item.completed",
  item: { id, type: "agent_message", text },
});

describe("a runner with Codex", () => {
  test("says it can run Codex when it is installed, and does not when it is not", async () => {
    const withCodex = connect();
    await withCodex.runtime.ready;
    await until(() => withCodex.plane.received.some((message) => message.type === "hello"));
    expect(withCodex.plane.received.find((message) => message.type === "hello")).toMatchObject({
      codex: true,
    });
    const without = connect(false);
    await without.runtime.ready;
    await until(() => without.plane.received.some((message) => message.type === "hello"));
    expect(without.plane.received.find((message) => message.type === "hello")).not.toHaveProperty(
      "codex",
      expect.anything(),
    );
  });

  test("a Codex run on a runner without it ends as an error, saying so", async () => {
    const { plane, runtime } = connect(false);
    await runtime.ready;
    plane.send(start());
    await until(() => ended(plane).length === 1);
    expect(ended(plane)[0]).toMatchObject({
      outcome: "error",
      error: "This runner cannot run Codex",
    });
  });

  test("a run's events reach the control plane, the tools Codex calls run in the sandbox, and the turn is filed", async () => {
    const { plane, runtime, script } = connect();
    const folder = script([
      { type: "thread.started", thread_id: "cx-1" },
      { call: { tool: "read_file", args: { path: "a.txt" } } },
      said("m", "Read it."),
      {
        type: "turn.completed",
        usage: { input_tokens: 10, cached_input_tokens: 2, output_tokens: 3 },
      },
    ]);
    await runtime.ready;
    plane.send(start());
    await until(() => ended(plane).length === 1);
    expect(ended(plane)[0]).toMatchObject({ outcome: "response" });
    const events = plane.received.flatMap((message) =>
      message.type === "run.event" ? [message.event.type] : [],
    );
    expect(events).toEqual(["text", "usage"]);
    expect(filed(plane)).toHaveLength(1);
    expect(filed(plane)[0]!.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(Bun.file(join(folder, "tool-results.txt"))).toBeDefined();
    expect(await Bun.file(join(folder, "tool-results.txt")).text()).toContain("contents of a.txt");
    expect(await Bun.file(join(folder, "calls.jsonl")).text()).toContain("gpt-5");
  });

  test("a question ends the run as an interaction, and the answer starts the next turn on the same Codex thread", async () => {
    const { plane, runtime, script } = connect();
    const questions = [{ id: "a", text: "Which one?" }];
    const folder = script([
      { type: "thread.started", thread_id: "cx-9" },
      { call: { tool: "ask_user", args: { questions } } },
    ]);
    await runtime.ready;
    plane.send(start());
    await until(() => ended(plane).length === 1);
    const first = ended(plane)[0]!;
    expect(first).toMatchObject({ outcome: "interaction" });
    const continuation = (first as { continuation: unknown }).continuation;

    script([{ type: "turn.started" }, said("n", "Using the first.")]);
    plane.send({
      type: "run.resume",
      runId: "run-2",
      thread,
      continuation,
      response: { type: "tool-question", answers: [{ questionId: "a", value: "the first" }] },
      codex: { modelId: "gpt-5" },
    });
    await until(() => ended(plane).length === 2);
    expect(ended(plane)[1]).toMatchObject({ outcome: "response" });
    const calls = (await Bun.file(join(folder, "calls.jsonl")).text()).trim().split("\n");
    const second = JSON.parse(calls.at(-1)!) as { args: string[]; input: string };
    expect(second.args.slice(-2)).toEqual(["resume", "cx-9"]);
    expect(second.input).toBe("The user answered your question:\n- Which one?: the first");
    expect(
      filed(plane)
        .at(-1)!
        .messages.map((message) => message.role),
    ).toEqual(["tool", "assistant"]);
  });

  test("a failed turn ends the run as an error with what Codex said", async () => {
    const { plane, runtime, script } = connect();
    script([{ type: "turn.failed", error: { message: "usage limit reached" } }]);
    await runtime.ready;
    plane.send(start());
    await until(() => ended(plane).length === 1);
    expect(ended(plane)[0]).toMatchObject({ outcome: "error", error: "usage limit reached" });
  });

  test("a run that is cancelled stops Codex and ends as an error with the reason", async () => {
    const { plane, runtime, script } = connect();
    script([{ type: "thread.started", thread_id: "cx-5" }, "hang"]);
    await runtime.ready;
    plane.send(start());
    await Bun.sleep(400);
    plane.send({ type: "run.cancel", runId: "run-1", reason: "Stopped by the user" });
    await until(() => ended(plane).length === 1);
    expect(ended(plane)[0]).toMatchObject({ outcome: "error", error: "Stopped by the user" });
  });

  test("a message sent while Codex works is refused, with when to send it instead", async () => {
    const { plane, runtime, script } = connect();
    script([{ type: "thread.started", thread_id: "cx-6" }, "hang"]);
    await runtime.ready;
    plane.send(start());
    await Bun.sleep(400);
    plane.send({
      type: "call",
      id: "steer-1",
      method: "run.steer",
      params: { runId: "run-1", steerId: "s1", prompt: "also this" },
    });
    await until(() => plane.received.some((m) => m.type === "reply" && m.id === "steer-1"));
    const reply = plane.received.find((m) => m.type === "reply" && m.id === "steer-1");
    expect(reply).toMatchObject({
      ok: true,
      result: { status: "refused", reason: expect.stringContaining("send it when the run ends") },
    });
    plane.send({ type: "run.cancel", runId: "run-1", reason: "done" });
    await until(() => ended(plane).length === 1);
  });

  test("answers the control plane's Codex sign-in: the link and the code, then signed in when approved", async () => {
    const { plane, runtime, home } = connect(
      true,
      join(import.meta.dir, "testing", "fake-codex-login.ts"),
    );
    mkdirSync(home, { recursive: true });
    await runtime.ready;
    const ask = async (id: string, action: string) => {
      plane.send({ type: "call", id, method: "codex.login", params: { action } });
      await until(() => plane.received.some((m) => m.type === "reply" && m.id === id));
      return plane.received.find((m) => m.type === "reply" && m.id === id);
    };
    expect(await ask("l1", "status")).toMatchObject({ ok: true, result: { state: "signed-out" } });
    expect(await ask("l2", "start")).toMatchObject({
      ok: true,
      result: { state: "waiting", url: "https://auth.openai.com/codex/device", code: "AOL5-C2T9O" },
    });
    expect(await ask("l3", "cancel")).toMatchObject({ ok: true, result: { state: "signed-out" } });
  });

  test("a runner with no Codex says so to a sign-in, and does not fail the call", async () => {
    const { plane, runtime } = connect(false);
    await runtime.ready;
    plane.send({ type: "call", id: "l1", method: "codex.login", params: { action: "status" } });
    await until(() => plane.received.some((m) => m.type === "reply" && m.id === "l1"));
    expect(plane.received.find((m) => m.type === "reply" && m.id === "l1")).toMatchObject({
      ok: true,
      result: { state: "unavailable" },
    });
  });
});
