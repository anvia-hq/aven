import { describe, expect, test } from "bun:test";

import { CODEX_TOKEN_MISSING } from "@aven/protocol/runtime-wire";

import { backendFor } from "./agent-backends";
import { CodexRuns } from "@aven/codex/codex-backend";
import { createRunDriver } from "./run-driver";
import { RunOutbox, openRunDatabase } from "./run-outbox";
import { RunRecords } from "./run-records";
import { journalPath } from "@aven/agent-backend/testing/journal-path";
import { noProcesses } from "./thread-processes";
import type { RuntimeToControlPlane } from "@aven/protocol/types";
import type { CodexQuery, CodexQueryInput, CodexSdkEvent } from "@aven/agent-backend/types";
import type { RunMessage, ThreadWorkspaces } from "./types";

const TOKEN_A = "sk-codex-alice-thread-0001";
const TOKEN_B = "sk-codex-bob-thread-000002";

function reply(token: string, text: string): CodexSdkEvent[] {
  return [
    { type: "thread.started", thread_id: `session-${token.slice(-4)}` },
    { type: "item.completed", item: { id: "m", type: "agent_message", text } },
    {
      type: "turn.completed",
      usage: {
        input_tokens: 4,
        cached_input_tokens: 0,
        output_tokens: 2,
        reasoning_output_tokens: 0,
      },
    },
  ];
}

function queryOf(gate?: Promise<void>) {
  const inputs: CodexQueryInput[] = [];
  const query: CodexQuery = (input) => {
    inputs.push(input);
    const stream = (async function* () {
      for (const event of reply(input.token, `hello ${input.token}`).slice(0, 2)) yield event;

      if (gate) await gate;

      yield reply(input.token, "")[2]!;
    })();
    return stream;
  };
  return { query, inputs };
}

function driverFor(query: CodexQuery, workspace = "/work/alice") {
  const path = journalPath();
  const backend = CodexRuns.open(path, query);
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
    backend: (kind) => backendFor(new Map([["codex", Promise.resolve(backend)]]), kind),
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
    backend: "codex",
  };

  if (token) message.codexToken = token;

  return message;
};

const ended = (reported: RuntimeToControlPlane[]) =>
  reported.find((message) => message.type === "run.end");

describe("the Codex backend", () => {
  test("uses the key of the run it was given, and the next run's key on the next run", async () => {
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

  test("resumes the thread's Codex session on the next message", async () => {
    const { query, inputs } = queryOf();
    const { driver, backend } = driverFor(query);
    await driver.start(start("run-1", "thread-a", TOKEN_A));
    await driver.start(start("run-2", "thread-a", TOKEN_A));
    await backend.close();
    expect(inputs[1]?.sessionId).toBe(`session-${TOKEN_A.slice(-4)}`);
  });

  test("leaves no run registered when the workspace cannot be resolved", async () => {
    const { query } = queryOf();
    const backend = CodexRuns.open(journalPath(), query);
    const refused = backend.start(
      "run-1",
      "thread-a",
      "hello",
      {
        codex: {
          token: TOKEN_A,
          tools: {} as never,
          workspace: async () => {
            throw new Error("The workspace is gone");
          },
        },
      } as never,
      () => undefined,
    );
    await expect(refused).rejects.toThrow("The workspace is gone");
    expect(await backend.steer("codex-run-1", "more", "s1")).toBe(false);
    await backend.close();
  });

  test("fails with a missing key and does not call Codex", async () => {
    const { query, inputs } = queryOf();
    const { driver, reported, backend } = driverFor(query);
    await driver.start(start("run-1", "thread-a"));
    await backend.close();
    expect(inputs).toEqual([]);
    expect(ended(reported)).toMatchObject({
      type: "run.end",
      outcome: "error",
      error: CODEX_TOKEN_MISSING,
    });
  });
});
