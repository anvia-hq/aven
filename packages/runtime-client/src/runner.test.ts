import { afterEach, describe, expect, test } from "bun:test";

import type { RuntimeToControlPlane } from "@aven/protocol/runtime-wire";

import { startRuntime, type CreateRuntimeAgent } from "./runner";
import type { ThreadSandbox, ThreadWorkspaces } from "./sandbox";

// A control plane that records what the runtime sends and lets the test send frames back.
function fakeControlPlane() {
  const received: RuntimeToControlPlane[] = [];
  let client: { send(data: string): void } | undefined;
  const opened = Promise.withResolvers<void>();
  const server = Bun.serve({
    port: 0,
    fetch: (request, srv) =>
      srv.upgrade(request) ? undefined : new Response("no", { status: 400 }),
    websocket: {
      open(ws) {
        client = ws;
        opened.resolve();
      },
      message(_ws, data) {
        received.push(JSON.parse(String(data)) as RuntimeToControlPlane);
      },
    },
  });
  return {
    url: `ws://localhost:${server.port}`,
    received,
    opened: opened.promise,
    send: (message: unknown) => client?.send(JSON.stringify(message)),
    stop: () => server.stop(true),
  };
}

const thread = { id: "thread-1", organizationId: "org-1" };
const runStart = { type: "run.start", runId: "run-1", thread, prompt: "hi" };

// Sandboxes that come up when the test says so, and report a running process while `busy.now`.
function slowSandbox() {
  const gate = Promise.withResolvers<void>();
  const released: string[] = [];
  const busy = { now: false };
  const sandbox: ThreadWorkspaces = {
    async acquire(): Promise<ThreadSandbox> {
      await gate.promise;
      return { tools: [], hasRunningProcesses: async () => busy.now };
    },
    async release(threadId) {
      released.push(threadId);
    },
    async dispose() {},
  };
  return { sandbox, up: gate.resolve, released, busy };
}

// An agent whose stream is a stand-in: the runner only iterates it, awaits `result` and cancels.
// The cast is because the real stream type is Anvia's.
const agentThat =
  (
    events: (memory: Parameters<CreateRuntimeAgent>[0]["memory"]) => AsyncIterable<never>,
  ): CreateRuntimeAgent =>
  ({ memory }) => ({
    agent: {
      stream: () =>
        Object.assign(events(memory), {
          result: Promise.resolve({ type: "response" as const }),
          cancel: () => undefined,
        }) as never,
    },
  });

const iterableThat = (step: () => Promise<unknown>): AsyncIterable<never> => ({
  [Symbol.asyncIterator]: () => ({
    next: async () => {
      await step();
      return { done: true, value: undefined };
    },
  }),
});

const noEvents = iterableThat(async () => undefined);

const until = async (condition: () => boolean) => {
  for (let i = 0; i < 100 && !condition(); i++) await Bun.sleep(20);
  expect(condition()).toBe(true);
};

const cleanups: (() => unknown)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

function connect(
  options: Partial<Parameters<typeof startRuntime>[0]> & { sandbox: ThreadWorkspaces },
) {
  const plane = fakeControlPlane();
  const runtime = startRuntime({ url: plane.url, token: "t", ...options });
  cleanups.push(() => runtime.stop(), plane.stop);
  return { plane, runtime };
}

describe("startRuntime", () => {
  test("the sandbox gets the repository's access by asking the control plane about the run", async () => {
    const access = {
      cloneUrl: "https://github.com/acme/web.git",
      defaultBranch: "main",
      token: "t",
    };
    let given: unknown;
    const sandbox: ThreadWorkspaces = {
      async acquire(_thread, repo): Promise<ThreadSandbox> {
        given = await repo();
        return { tools: [], hasRunningProcesses: async () => false };
      },
      async release() {},
      async dispose() {},
    };
    const { plane, runtime } = connect({ sandbox, createAgent: agentThat(() => noEvents) });
    await runtime.ready;
    plane.send(runStart);

    await until(() => plane.received.some((message) => message.type === "call"));
    const call = plane.received.find((message) => message.type === "call");
    expect(call).toMatchObject({ method: "repo.access", params: { runId: "run-1" } });
    plane.send({ type: "reply", id: (call as { id: string }).id, ok: true, result: access });

    await until(() => given !== undefined);
    expect(given).toEqual(access);
  });

  test("a cancel that arrives while the sandbox is still starting ends the run before it begins", async () => {
    const { sandbox, up } = slowSandbox();
    let created = false;
    const { plane, runtime } = connect({
      sandbox,
      createAgent: (input) => {
        created = true;
        return agentThat(() => noEvents)(input);
      },
    });
    await runtime.ready;
    plane.send(runStart);
    await Bun.sleep(50);
    plane.send({ type: "run.cancel", runId: "run-1", reason: "stopped by the user" });
    await Bun.sleep(50);
    up();

    await until(() => plane.received.some((message) => message.type === "run.end"));
    expect(plane.received.find((message) => message.type === "run.end")).toMatchObject({
      outcome: "error",
      error: "stopped by the user",
    });
    expect(created).toBe(false);
  });

  test("a memory call the control plane never answers fails the run with a clear error", async () => {
    const { sandbox, up } = slowSandbox();
    up();
    const { plane, runtime } = connect({
      sandbox,
      callTimeoutMs: 100,
      createAgent: agentThat((memory) => iterableThat(() => memory.load({} as never))),
    });
    await runtime.ready;
    plane.send(runStart);

    await until(() => plane.received.some((message) => message.type === "run.end"));
    const end = plane.received.find((message) => message.type === "run.end");
    expect(end).toMatchObject({ outcome: "error" });
    expect(end && "error" in end ? end.error : "").toContain("did not answer memory.load");
  });

  test("a thread with nothing running gives up its sandbox after the idle time", async () => {
    const { sandbox, up, released } = slowSandbox();
    up();
    const { plane, runtime } = connect({
      sandbox,
      idleReleaseMs: 50,
      createAgent: agentThat(() => noEvents),
    });
    await runtime.ready;
    plane.send(runStart);

    await until(() => released.includes("thread-1"));
    expect(plane.received.some((message) => message.type === "run.end")).toBe(true);
  });

  test("a thread whose sandbox still has a running process keeps it until the process ends", async () => {
    const { sandbox, up, released, busy } = slowSandbox();
    up();
    busy.now = true;
    const { plane, runtime } = connect({
      sandbox,
      idleReleaseMs: 40,
      createAgent: agentThat(() => noEvents),
    });
    await runtime.ready;
    plane.send(runStart);
    await until(() => plane.received.some((message) => message.type === "run.end"));

    // Several idle periods pass with a dev server still up.
    await Bun.sleep(250);
    expect(released).toEqual([]);

    busy.now = false;
    await until(() => released.includes("thread-1"));
  });

  test("a run that starts while the idle check is asking keeps the sandbox", async () => {
    const { sandbox, up, released } = slowSandbox();
    up();
    const asking = Promise.withResolvers<void>();
    const hold = Promise.withResolvers<void>();
    const asked = Promise.withResolvers<void>();
    const checking: ThreadWorkspaces = {
      ...sandbox,
      acquire: async () => ({
        tools: [],
        hasRunningProcesses: async () => {
          asked.resolve();
          await asking.promise;
          return false;
        },
      }),
    };
    let runs = 0;
    const { plane, runtime } = connect({
      sandbox: checking,
      idleReleaseMs: 30,
      // The first run ends at once; the second is still going when the idle check comes back.
      createAgent: (input) =>
        agentThat(() => (++runs === 1 ? noEvents : iterableThat(() => hold.promise)))(input),
    });
    await runtime.ready;
    plane.send(runStart);
    await asked.promise;

    plane.send({ ...runStart, runId: "run-2" });
    await Bun.sleep(50);
    asking.resolve();
    await Bun.sleep(100);
    expect(released).toEqual([]);
    hold.resolve();
  });
});
