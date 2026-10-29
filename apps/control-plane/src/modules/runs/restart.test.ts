import { describe, expect, test } from "bun:test";

import type { ConversationStore } from "@aven/agents/memory";

import { RuntimeOfflineError } from "../runtimes/hub";
import { UnavailableError } from "../../errors";
import type { Runtime, RunThread, RuntimeRun } from "./runtime";
import { RunManager } from "./service";

// A runtime that is never online, so a run restarted by a finished job cannot start.
function offlineRuntime() {
  let notify: (threadId: string, notice: string) => void = () => undefined;
  const runtime: Runtime = {
    start: () => {
      throw new RuntimeOfflineError();
    },
    stopJobs: () => undefined,
    onJobNotice: (listener) => {
      notify = listener;
      return () => undefined;
    },
    dispose: () => undefined,
  };
  return { runtime, notify: (threadId: string, notice: string) => notify(threadId, notice) };
}

describe("a run restarted by a finished background job", () => {
  test("that cannot start says so instead of losing the notice silently", async () => {
    const { runtime, notify } = offlineRuntime();
    const manager = new RunManager({
      store: {} as ConversationStore,
      runtime,
      resolveModel: async () => null,
      onRunFinished: () => undefined,
    });
    const thread: RunThread = {
      id: crypto.randomUUID(),
      organizationId: "org",
      runtimeId: crypto.randomUUID(),
    };
    // Registers the thread's channel, as a client attaching or a first message would.
    await expect(manager.start(thread, "hi")).rejects.toBeInstanceOf(RuntimeOfflineError);

    const warnings: unknown[][] = [];
    const original = console.warn;
    console.warn = (...args) => void warnings.push(args);
    try {
      notify(thread.id, "job done");
      await Bun.sleep(20);
    } finally {
      console.warn = original;
    }
    expect(warnings).toHaveLength(1);
    expect(String(warnings[0]![0])).toContain(thread.id);
  });
});

// A run that stays live until `finish`, recording what is steered into it.
function liveRun() {
  const steered: string[] = [];
  const done = Promise.withResolvers<{ type: string }>();
  const handle: RuntimeRun = {
    events: {
      [Symbol.asyncIterator]: () => ({
        next: async () => (await done.promise, { done: true as const, value: undefined }),
      }),
    },
    result: done.promise,
    cancel: () => undefined,
    steer: (prompt) => void steered.push(prompt),
  };
  return { handle, steered, finish: () => done.resolve({ type: "response" }) };
}

function managerRunning(handle: RuntimeRun, store: Partial<ConversationStore> = {}) {
  let notify: (threadId: string, notice: string) => void = () => undefined;
  const runtime: Runtime = {
    start: () => handle,
    stopJobs: () => undefined,
    onJobNotice: (listener) => {
      notify = listener;
      return () => undefined;
    },
    dispose: () => undefined,
  };
  const manager = new RunManager({
    store: { load: async () => [], ...store } as ConversationStore,
    runtime,
    resolveModel: async () => null,
    onRunFinished: () => undefined,
  });
  return { manager, notify: (threadId: string, notice: string) => notify(threadId, notice) };
}

const newThread = (): RunThread => ({
  id: crypto.randomUUID(),
  organizationId: "org",
  runtimeId: crypto.randomUUID(),
});

describe("starting a run", () => {
  test("a history that cannot be loaded is unavailable, with the cause kept out of the message", async () => {
    const { handle } = liveRun();
    const { manager } = managerRunning(handle, {
      load: async () => {
        throw new Error("connection refused 10.0.0.5");
      },
    });
    const silenced = console.warn;
    console.warn = () => undefined;
    try {
      const failure = await manager.start(newThread(), "hi").catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(UnavailableError);
      expect((failure as Error).message).not.toContain("10.0.0.5");
    } finally {
      console.warn = silenced;
    }
  });
});

describe("a finished job's notice that meets a run which started meanwhile", () => {
  test("is steered into that run instead of being lost", async () => {
    const runs = [liveRun(), liveRun()];
    const handles = runs.map((run) => run.handle);
    let notify: (threadId: string, notice: string) => void = () => undefined;
    const runtime: Runtime = {
      start: () => handles.shift()!,
      stopJobs: () => undefined,
      onJobNotice: (listener) => {
        notify = listener;
        return () => undefined;
      },
      dispose: () => undefined,
    };
    const manager = new RunManager({
      store: { load: async () => [] } as unknown as ConversationStore,
      runtime,
      resolveModel: async () => null,
      onRunFinished: () => undefined,
    });
    const thread = newThread();
    const sender = { userId: "user" };
    await manager.start(thread, "first", sender);
    runs[0]!.finish();
    while (manager.isRunning(thread.id)) await Bun.sleep(1);

    // The job's notice finds no run and begins a restart, which first looks up the sender's model.
    notify(thread.id, "job done");
    // A user message takes the slot before that restart gets to start its own run.
    await manager.start(thread, "second", sender);
    await Bun.sleep(20);

    expect(runs[1]!.steered).toEqual(["job done"]);
    runs[1]!.finish();
  });
});
