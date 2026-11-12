import { describe, expect, test } from "bun:test";

import { CLAUDE_TOKEN_MISSING } from "@aven/protocol/runtime-wire";

import { backendFor, openAgentBackends } from "./agent-backends";
import { ClaudeRuns } from "./claude-backend";
import { createRunDriver } from "./run-driver";
import { RunOutbox, openRunDatabase } from "./run-outbox";
import { RunRecords } from "./run-records";
import { journalPath } from "./testing/journal-path";
import { noProcesses } from "./thread-processes";
import type { RuntimeToControlPlane } from "@aven/protocol/types";
import type { ClaudeQuery, ClaudeQueryInput, RunMessage, ThreadWorkspaces } from "./types";

const TOKEN_A = "setup-token-alice-thread-0001";
const TOKEN_B = "setup-token-bob-thread-000002";

const until = async (condition: () => boolean) => {
  for (let i = 0; i < 50 && !condition(); i++) await Bun.sleep(10);
  expect(condition()).toBe(true);
};

function queryOf(gate?: Promise<void>) {
  const inputs: ClaudeQueryInput[] = [];
  const query: ClaudeQuery = async function* (input) {
    inputs.push(input);
    yield {
      type: "assistant",
      session_id: `session-${input.token.slice(-4)}`,
      message: { content: [{ type: "text", text: `hello ${input.token}` }] },
    };
    if (gate) await gate;
    yield {
      type: "result",
      subtype: "success",
      session_id: `session-${input.token.slice(-4)}`,
      usage: { input_tokens: 4, output_tokens: 2 },
    };
  };
  return { query, inputs };
}

function driverFor(query: ClaudeQuery, workspace = "/work/alice") {
  const path = journalPath();
  const backend = ClaudeRuns.open(path, query);
  const db = openRunDatabase(path);
  const records = new RunRecords(db);
  const outbox = new RunOutbox(db);
  const reported: RuntimeToControlPlane[] = [];
  const calls: { method: string; params: unknown }[] = [];
  const made: string[] = [];
  const sandbox: ThreadWorkspaces = {
    async acquire() {
      return { tools: [], hasRunningProcesses: async () => false, processes: noProcesses };
    },
    workspace: async () => workspace,
    async release() {},
    async dispose() {},
  };
  const driver = createRunDriver({
    backend: (kind) => backendFor(new Map([["claude", Promise.resolve(backend)]]), kind),
    records,
    outbox,
    sandbox,
    createAgent: ({ id }) => {
      made.push(id);
      return { agent: {} as never };
    },
    call: async (method, params) => {
      calls.push({ method, params });
      return null as never;
    },
    report: (runId, make) => {
      const message = outbox.push(runId, make);
      if (message) reported.push(message);
    },
    boxes: new Map(),
    starting: async () => {},
    finished: () => {},
    controlPlane: "http://localhost",
    stopped: () => false,
  });
  return { driver, records, reported, calls, made, backend, path };
}

const start = (runId: string, threadId: string, token?: string): RunMessage => {
  const message: Extract<RunMessage, { type: "run.start" }> = {
    type: "run.start",
    runId,
    thread: { id: threadId, organizationId: "org-1" },
    prompt: "look here",
    backend: "claude",
  };
  if (token) message.claudeToken = token;
  return message;
};

const ended = (reported: RuntimeToControlPlane[]) =>
  reported.find((message) => message.type === "run.end");

describe("the Claude backend", () => {
  test("uses the token of the run it was given, and the next run's token on the next run", async () => {
    const { query, inputs } = queryOf();
    const { driver, records, reported, calls, made, backend } = driverFor(query);
    await driver.start(start("run-a", "thread-a", TOKEN_A));
    await driver.start(start("run-b", "thread-b", TOKEN_B));
    await backend.close();

    expect(inputs.map((input) => input.token)).toEqual([TOKEN_A, TOKEN_B]);
    expect(inputs[0]?.cwd).toBe("/work/alice");
    expect(inputs[1]?.sessionId).toBeUndefined();
    expect(made).toEqual([]);
    expect(JSON.stringify(records.get("run-a"))).not.toContain(TOKEN_A);
    expect(JSON.stringify(reported)).not.toContain(TOKEN_A);
    expect(JSON.stringify(reported)).toContain("[redacted]");
    const filed = calls.filter((call) => call.method === "memory.append");
    expect(filed).toHaveLength(2);
    expect(JSON.stringify(filed[0]?.params)).toContain("look here");
    expect(JSON.stringify(filed[0]?.params)).not.toContain(TOKEN_A);
    expect(ended(reported)?.type === "run.end" && ended(reported)).toMatchObject({
      outcome: "response",
    });
  });

  test("resumes the thread's Claude session on the next message", async () => {
    const { query, inputs } = queryOf();
    const { driver, backend } = driverFor(query);
    await driver.start(start("run-1", "thread-a", TOKEN_A));
    await driver.start(start("run-2", "thread-a", TOKEN_A));
    await backend.close();
    expect(inputs[1]?.sessionId).toBe(`session-${TOKEN_A.slice(-4)}`);
  });

  test("fails with a missing token and does not call Claude", async () => {
    const { query, inputs } = queryOf();
    const { driver, reported, backend } = driverFor(query);
    await driver.start(start("run-1", "thread-a"));
    await backend.close();
    expect(inputs).toEqual([]);
    expect(ended(reported)).toMatchObject({
      type: "run.end",
      outcome: "error",
      error: CLAUDE_TOKEN_MISSING,
    });
  });

  test("takes a message while it is working and compacts by resuming the session", async () => {
    const prompts: string[] = [];
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const inputs: ClaudeQueryInput[] = [];
    const query: ClaudeQuery = async function* (input) {
      inputs.push(input);
      const iterator = input.prompt[Symbol.asyncIterator]();
      const first = await iterator.next();
      prompts.push(first.done ? "" : first.value);
      yield {
        type: "assistant",
        session_id: "sess-steer",
        message: { content: [{ type: "text", text: first.done ? "" : first.value }] },
      };
      const steered = await Promise.race([
        gate.then(() => undefined),
        iterator.next().then((item) => (item.done ? undefined : item.value)),
      ]);
      if (steered) {
        prompts.push(steered);
        yield {
          type: "assistant",
          session_id: "sess-steer",
          message: { content: [{ type: "text", text: steered }] },
        };
      }
      yield { type: "result", subtype: "success", session_id: "sess-steer" };
    };
    const { driver, reported, backend } = driverFor(query);
    const running = driver.start(start("run-1", "thread-a", TOKEN_A));
    await until(() => inputs.length === 1);
    expect(await driver.steer({ runId: "run-1", steerId: "s1", prompt: "also this" })).toEqual({
      status: "queued",
    });
    release();
    await running;
    expect(prompts).toContain("also this");

    await driver.start({
      ...start("run-2", "thread-a", TOKEN_A),
      prompt: "/compact",
      compact: true,
    } as RunMessage);
    await backend.close();
    expect(inputs[1]?.sessionId).toBe("sess-steer");
    expect(prompts).toContain("/compact");
    expect(ended(reported)).toMatchObject({ type: "run.end", outcome: "response" });
  });

  test("is offered next to native", async () => {
    const path = journalPath();
    const backends = openAgentBackends(path, new Set());
    expect(backends.offered).toEqual(["native", "claude"]);
    expect((await backends.get("claude")).kind).toBe("claude");
    expect((await backends.get(undefined)).kind).toBe("native");
    await backends.close();
  });
});
