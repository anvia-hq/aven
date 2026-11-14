import { describe, expect, test } from "bun:test";

import { AGENT_BACKEND_CAPABILITIES } from "@aven/protocol/runtime-wire";

import { backendFor } from "./agent-backends";
import { createRunDriver } from "./run-driver";
import { RunOutbox, openRunDatabase } from "./run-outbox";
import { RunRecords } from "./run-records";
import { journalPath } from "@aven/agent-backend/testing/journal-path";
import { noProcesses } from "./thread-processes";
import type { RuntimeToControlPlane } from "@aven/protocol/types";
import type { AgentBackend, DurableEnd, FollowedRun } from "@aven/agent-backend/types";
import type { RunMessage, RunRecord, ThreadWorkspaces } from "./types";

const thread = { id: "thread-1", organizationId: "org-1" };

const continuation = {
  version: 1,
  agentId: "run-asked",
  sourceRunId: "durable-1",
  interaction: {
    type: "tool-question",
    id: "i1",
    toolName: "ask_user",
    toolCallId: "c1",
    internalCallId: "ic1",
    questions: [{ id: "q1", text: "Which?" }],
  },
  state: {},
};

const response = { type: "tool-question", answers: [{ questionId: "q1", value: "red" }] };

const until = async (condition: () => boolean) => {
  for (let i = 0; i < 50 && !condition(); i++) await Bun.sleep(10);
  expect(condition()).toBe(true);
};

function fakeBackend() {
  const calls: { method: string; id: string }[] = [];
  const pending = new Map<string, (end: DurableEnd) => void>();
  let parked: { runId: string; agentId: string } | undefined;
  const followed = (id: string): FollowedRun => {
    const done = new Promise<DurableEnd>((resolve) => pending.set(id, resolve));
    return {
      durableId: `durable-${id}`,
      done,
      cancel: async () => {},
    };
  };
  const backend: AgentBackend = {
    kind: "native",
    capabilities: AGENT_BACKEND_CAPABILITIES.native,
    asked: async () => parked,
    async start(runId) {
      const run = followed(runId);
      calls.push({ method: "start", id: runId });
      return run;
    },
    async rejoin(durableId) {
      const run = followed(durableId);
      calls.push({ method: "rejoin", id: durableId });
      return run;
    },
    async answer(asked) {
      const run = followed(asked.runId);
      calls.push({ method: "answer", id: asked.runId });
      return run;
    },
    async steer(durableId) {
      calls.push({ method: "steer", id: durableId });
      return true;
    },
    startGoal: async () => {
      throw new Error("no goal");
    },
    transcriptTurn: () => 1,
    unfinishedMessages: async () => [],
    async cancelRun(durableId) {
      calls.push({ method: "cancel", id: durableId });
    },
    close: async () => {},
  };
  return {
    backend,
    calls,
    park(run: { runId: string; agentId: string }) {
      parked = run;
    },
    finish(id: string) {
      pending.get(id)?.({ type: "response", messages: [] });
    },
  };
}

function harness(native: Promise<AgentBackend>, other?: Promise<AgentBackend>) {
  const db = openRunDatabase(journalPath());
  const records = new RunRecords(db);
  const outbox = new RunOutbox(db);
  const reported: RuntimeToControlPlane[] = [];
  const made: string[] = [];
  const acquired: string[] = [];
  const installed = new Map<string, Promise<AgentBackend>>([["native", native]]);

  if (other) installed.set("other", other);

  const sandbox: ThreadWorkspaces = {
    async acquire(threadRef) {
      acquired.push(threadRef.id);
      return { tools: [], hasRunningProcesses: async () => false, processes: noProcesses };
    },
    workspace: async () => undefined,
    async release() {},
    async dispose() {},
  };
  const driver = createRunDriver({
    backend: (kind) => backendFor(installed, kind),
    records,
    outbox,
    sandbox,
    createAgent: ({ id }) => {
      made.push(id);
      return { agent: {} as never };
    },
    call: async () => {
      throw new Error("no call");
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
  return { driver, records, outbox, reported, made, acquired };
}

const start = (runId: string, backend?: string): RunMessage =>
  ({ type: "run.start", runId, thread, prompt: "hi", backend }) as RunMessage;

const ended = (reported: RuntimeToControlPlane[]) =>
  reported.filter((message) => message.type === "run.end");

describe("the run driver chooses the thread's backend (decision 0220)", () => {
  test("a run that names none, and one that names native, both use native", async () => {
    const native = fakeBackend();
    const other = fakeBackend();
    const { driver, records, reported } = harness(
      Promise.resolve(native.backend),
      Promise.resolve(other.backend),
    );

    const first = driver.start(start("run-1"));
    await until(() => native.calls.some((call) => call.method === "start"));
    expect(records.get("run-1")?.backend).toBe("native");
    native.finish("run-1");
    await first;

    const second = driver.start(start("run-2", "native"));
    await until(() => native.calls.filter((call) => call.method === "start").length === 2);
    native.finish("run-2");
    await second;

    expect(other.calls).toEqual([]);
    expect(ended(reported).map((message) => message.outcome)).toEqual(["response", "response"]);
  });

  test("a run uses the backend it names, including a steer and an answer", async () => {
    const native = fakeBackend();
    const other = fakeBackend();
    const { driver, records } = harness(
      Promise.resolve(native.backend),
      Promise.resolve(other.backend),
    );
    other.park({ runId: "parked", agentId: "run-asked" });

    const running = driver.start(start("run-1", "other"));
    await until(() => records.get("run-1")?.durableId === "durable-run-1");
    expect(other.calls).toEqual([{ method: "start", id: "run-1" }]);
    expect(native.calls).toEqual([]);

    expect(await driver.steer({ runId: "run-1", steerId: "s1", prompt: "more" })).toEqual({
      status: "queued",
    });
    expect(other.calls).toContainEqual({ method: "steer", id: "durable-run-1" });
    other.finish("run-1");
    await running;

    const answering = driver.start({
      type: "run.resume",
      runId: "run-2",
      thread,
      continuation,
      response,
      backend: "other",
    } as unknown as RunMessage);
    await until(() => other.calls.some((call) => call.method === "answer"));
    other.finish("parked");
    await answering;

    expect(native.calls).toEqual([]);
    expect(other.calls).toContainEqual({ method: "answer", id: "parked" });
  });

  test("a backend this runner does not drive ends the run before any agent starts", async () => {
    const native = fakeBackend();
    const { driver, reported, made, acquired } = harness(Promise.resolve(native.backend));

    await driver.start(start("run-1", "other"));

    expect(ended(reported)).toMatchObject([
      { outcome: "error", error: "This runner does not drive the other agent backend" },
    ]);
    expect(native.calls).toEqual([]);
    expect(made).toEqual([]);
    expect(acquired).toEqual([]);

    await driver.start(start("run-2", ""));
    expect(ended(reported)[1]).toMatchObject({
      outcome: "error",
      error: "This runner does not drive that agent backend",
    });
  });

  test("a run taken up again uses the backend it was started with, and native when a record from before names none", async () => {
    const native = fakeBackend();
    const other = fakeBackend();
    const { driver, records, outbox } = harness(
      Promise.resolve(native.backend),
      Promise.resolve(other.backend),
    );
    const older: RunRecord = {
      runId: "run-old",
      thread: { id: "thread-old", organizationId: "org-1" },
      kind: "start",
      agentId: "run-run-old",
      durableId: "durable-old",
      turn: 0,
      phase: "chat",
    };
    const named: RunRecord = {
      ...older,
      runId: "run-named",
      thread: { id: "thread-named", organizationId: "org-1" },
      durableId: "durable-named",
      backend: "other",
    };
    records.save(older);
    records.save(named);
    outbox.open(older.runId);
    outbox.open(named.runId);

    const first = driver.restore(older.runId);
    await until(() => native.calls.some((call) => call.id === "durable-old"));
    native.finish("durable-old");
    await first;

    const second = driver.restore(named.runId);
    await until(() => other.calls.some((call) => call.id === "durable-named"));
    other.finish("durable-named");
    await second;

    expect(native.calls).toEqual([{ method: "rejoin", id: "durable-old" }]);
    expect(other.calls).toEqual([{ method: "rejoin", id: "durable-named" }]);
  });
});
