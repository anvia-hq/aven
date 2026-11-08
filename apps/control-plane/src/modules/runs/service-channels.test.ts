import { describe, expect, test } from "bun:test";

import { memoryContinuations, memoryFailures } from "../../testing/memory-continuations";
import { RunManager } from "./service";
import type { ConversationStore } from "../../types";
import type { RunResult, RunThread, Runtime, RuntimeRun } from "./types";
import type { RunEvent } from "@aven/protocol/types";

type FakeRun = {
  handle: RuntimeRun;
  finish(outcome?: RunResult): void;
};

function fakeRun(): FakeRun {
  const done = Promise.withResolvers<RunResult>();
  const handle: RuntimeRun = {
    events: {
      [Symbol.asyncIterator]: () => ({
        next: async () => (await done.promise, { done: true as const, value: undefined }),
      }),
    },
    result: done.promise,
    cancel: () => undefined,
    steer: async () => ({ status: "closed" as const }),
  };
  return { handle, finish: (outcome: RunResult = { type: "response" }) => done.resolve(outcome) };
}

function scriptedRuntime() {
  const runs: FakeRun[] = [];
  const open = () => {
    const run = fakeRun();
    runs.push(run);
    return run.handle;
  };
  const runtime: Runtime = { start: open, resume: open, dispose: () => undefined };
  const current = () => {
    const run = runs.at(-1);
    if (!run) throw new Error("no run was started");
    return run;
  };
  return { runtime, current };
}

function managerFor(
  runtime: Runtime,
  extra: Partial<ConstructorParameters<typeof RunManager>[0]> = {},
) {
  return new RunManager({
    store: { load: async () => [] } as unknown as ConversationStore,
    runtime,
    onRunFinished: () => undefined,
    continuations: memoryContinuations().store,
    failures: memoryFailures().store,
    ...extra,
  });
}

const newThread = (): RunThread => ({
  id: crypto.randomUUID(),
  organizationId: "org",
  runtimeId: crypto.randomUUID(),
});

function attach(manager: RunManager, thread: RunThread) {
  const controller = new AbortController();
  const events: RunEvent[] = [];
  const loop = (async () => {
    for await (const event of manager.events(thread, controller.signal)) {
      if (event) events.push(event);
    }
  })();
  return {
    events,
    detach: async () => {
      controller.abort();
      await loop;
    },
  };
}

async function until(check: () => boolean | Promise<boolean>, ms = 5000) {
  const deadline = Date.now() + ms;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error("timed out waiting for condition");
    await Bun.sleep(5);
  }
}

describe("a thread's channel", () => {
  test("is dropped once its run ended with nobody watching, so a later client hears the store", async () => {
    const failures = memoryFailures();
    const { runtime, current } = scriptedRuntime();
    const manager = managerFor(runtime, { failures: failures.store });
    const thread = newThread();

    await manager.start(thread, "one");
    current().finish({ type: "error" });
    await until(() => !manager.isRunning(thread.id));
    expect(failures.saved.get(thread.id)).toContain("without a response");

    const first = attach(manager, thread);
    await until(() => first.events.length > 0);
    await first.detach();
    expect(first.events[0]).toMatchObject({ type: "snapshot", running: false });
    expect((first.events[0] as { error?: string }).error).toContain("without a response");

    failures.saved.delete(thread.id);

    const second = attach(manager, thread);
    await until(() => second.events.length > 0);
    await second.detach();
    expect(second.events[0]).not.toHaveProperty("error");
  });

  test("takes the thread row it is handed each time, so one continued on another runner is not used stale", async () => {
    const endings: RunThread[] = [];
    const { runtime, current } = scriptedRuntime();
    const manager = managerFor(runtime, {
      onRunFinished: (thread) => void endings.push(thread),
    });
    const thread = newThread();
    const watching = attach(manager, thread);
    await until(() => watching.events.length > 0);

    await manager.start(thread, "one");
    current().finish();
    await until(() => endings.length === 1);

    const continued: RunThread = { ...thread, runtimeId: crypto.randomUUID() };
    await manager.start(continued, "two");
    current().finish();
    await until(() => endings.length === 2);
    await watching.detach();

    expect(endings[0]).toEqual(thread);
    expect(endings[1]).toEqual(continued);
    expect(endings[1]!.runtimeId).not.toBe(thread.runtimeId);
  });

  test("stays while a client watches, and reports the next run to it", async () => {
    const { runtime, current } = scriptedRuntime();
    const manager = managerFor(runtime);
    const thread = newThread();
    const watching = attach(manager, thread);
    await until(() => watching.events.length > 0);

    await manager.start(thread, "one");
    current().finish();
    await until(() => watching.events.some((event) => event.type === "done"));

    await manager.start(thread, "two");
    current().finish();
    await until(() => watching.events.filter((event) => event.type === "done").length === 2);
    await watching.detach();

    expect(watching.events.map((event) => event.type)).toEqual([
      "snapshot",
      "run_start",
      "done",
      "run_start",
      "done",
    ]);
  });
});
