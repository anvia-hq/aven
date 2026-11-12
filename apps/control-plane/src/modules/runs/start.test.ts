import { describe, expect, test } from "bun:test";

import { UnavailableError } from "../../errors";
import {
  memoryContinuations,
  memoryFailures,
  memorySenders,
  memoryWorkedTimes,
} from "../../testing/memory-continuations";
import { RunBusyError, RunManager } from "./service";
import type { ConversationStore } from "../../types";
import type { RunResult, RunThread, Runtime, RuntimeRun } from "./types";
import type { RunEvent } from "@aven/protocol/types";

function liveRun() {
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
  return { handle, finish: () => done.resolve({ type: "response" }) };
}

function managerRunning(handle: RuntimeRun, store: Partial<ConversationStore> = {}) {
  return managerWith(
    { start: async () => handle, resume: async () => handle, dispose: () => undefined },
    store,
  );
}

function managerWith(runtime: Runtime, store: Partial<ConversationStore> = {}) {
  return new RunManager({
    store: { load: async () => [], ...store } as ConversationStore,
    runtime,
    onRunFinished: () => undefined,
    continuations: memoryContinuations().store,
    failures: memoryFailures().store,
    workedTimes: memoryWorkedTimes().store,
    senders: memorySenders().store,
  });
}

const newThread = (): RunThread => ({
  id: crypto.randomUUID(),
  organizationId: "org",
  runtimeId: crypto.randomUUID(),
});

describe("starting a run", () => {
  test("a history that cannot be loaded is unavailable, with the cause kept out of the message", async () => {
    const { handle } = liveRun();
    const manager = managerRunning(handle, {
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

  test("a thread has one run at a time, and cancel stops it", async () => {
    const { handle, finish } = liveRun();
    let cancelled = "";
    handle.cancel = (reason) => {
      cancelled = reason;
      finish();
    };
    const manager = managerRunning(handle);
    const thread = newThread();
    await manager.start(thread, "one");
    await expect(manager.start(thread, "two")).rejects.toBeInstanceOf(RunBusyError);

    expect(manager.cancel(thread.id)).toBe(true);
    expect(cancelled).toBe("Cancelled by user");
    expect(manager.cancel(newThread().id)).toBe(false);
  });

  test("a thread is held while its runner is reached, so a second start meanwhile is busy", async () => {
    const { handle } = liveRun();
    const reached = Promise.withResolvers<RuntimeRun>();
    let asked = 0;
    const held = managerWith({
      start: () => {
        asked++;
        return reached.promise;
      },
      resume: () => reached.promise,
      dispose: () => undefined,
    });
    const thread = newThread();

    const first = held.start(thread, "one");
    await expect(held.start(thread, "two")).rejects.toBeInstanceOf(RunBusyError);
    reached.resolve(handle);
    await first;

    expect(asked).toBe(1);
    expect(held.isRunning(thread.id)).toBe(true);
  });

  test("a runner that cannot be reached leaves the thread free for the next start", async () => {
    const { handle } = liveRun();
    let reachable = false;
    const manager = managerWith({
      start: async () => {
        if (!reachable) throw new UnavailableError("The runtime for this project is offline");

        return handle;
      },
      resume: async () => handle,
      dispose: () => undefined,
    });
    const thread = newThread();

    await expect(manager.start(thread, "one")).rejects.toBeInstanceOf(UnavailableError);
    expect(manager.isRunning(thread.id)).toBe(false);
    reachable = true;
    await manager.start(thread, "two");

    expect(manager.isRunning(thread.id)).toBe(true);
  });
});

describe("steering a run (decision 0098)", () => {
  const message = { id: "steer-1", prompt: "also this", mentions: [] };
  const heard = (manager: RunManager, thread: RunThread) => {
    const events: RunEvent[] = [];
    const controller = new AbortController();
    void (async () => {
      for await (const event of manager.events(thread, controller.signal)) {
        if (event) events.push(event);
      }
    })();
    return { events, stop: () => controller.abort() };
  };

  test("an agent that is finishing takes no more: the message is for a run of its own, once this one is over", async () => {
    const { handle, finish } = liveRun();
    handle.steer = async () => ({ status: "closed" });
    const manager = managerRunning(handle);
    const thread = newThread();
    const listener = heard(manager, thread);
    await manager.start(thread, "one");

    let outcome: string | undefined;
    const steering = manager.steer(thread, message).then((result) => (outcome = result));
    await Bun.sleep(30);
    expect(outcome).toBeUndefined();
    finish();
    await steering;

    expect(outcome).toBe("ended");
    expect(manager.isRunning(thread.id)).toBe(false);
    listener.stop();
    const steers = listener.events.filter((event) => event.type.startsWith("steer"));
    expect(steers).toEqual([
      { type: "steer_queued", ...message },
      { type: "steer_rejected", id: "steer-1", reason: undefined },
    ]);
  });

  test("an id names one message: sent again, it is refused and the runner is not asked twice", async () => {
    const { handle } = liveRun();
    let asked = 0;
    handle.steer = async () => {
      asked++;
      return { status: "queued" };
    };
    const manager = managerRunning(handle);
    const thread = newThread();
    await manager.start(thread, "one");

    expect(await manager.steer(thread, message)).toBe("queued");
    await expect(manager.steer(thread, { ...message, prompt: "something else" })).rejects.toThrow(
      "sent already",
    );
    expect(asked).toBe(1);
  });

  test("a runner that cannot be asked is unavailable, and nothing is left waiting", async () => {
    const { handle } = liveRun();
    handle.steer = async () => {
      throw new Error("The runtime did not answer run.steer");
    };
    const manager = managerRunning(handle);
    const thread = newThread();
    const listener = heard(manager, thread);
    await manager.start(thread, "one");
    const silenced = console.warn;
    console.warn = () => undefined;
    try {
      await expect(manager.steer(thread, message)).rejects.toBeInstanceOf(UnavailableError);
    } finally {
      console.warn = silenced;
    }
    listener.stop();
    expect(listener.events.map((event) => event.type)).toContain("steer_rejected");
    expect(manager.isRunning(thread.id)).toBe(true);
  });

  test("a runner that says the agent took a message the control plane does not know of changes nothing", async () => {
    const { handle, finish } = liveRun();
    handle.events = (async function* () {
      yield { type: "steer_applied", id: "unknown" } as RunEvent;
    })();
    const manager = managerRunning(handle);
    const thread = newThread();
    const listener = heard(manager, thread);
    await manager.start(thread, "one");
    finish();
    await Bun.sleep(30);
    listener.stop();
    expect(listener.events.map((event) => event.type)).not.toContain("steer");
    expect(listener.events.map((event) => event.type)).not.toContain("steer_applied");
  });
});

describe("usage", () => {
  const turn = { inputTokens: 1, outputTokens: 2, cacheWriteTokens: 3, cacheReadTokens: 4 };
  const generation = {
    modelId: "m",
    provider: "anthropic",
    usage: {
      inputTokens: 8,
      outputTokens: 2,
      totalTokens: 10,
      cachedInputTokens: 4,
      cacheCreationInputTokens: 3,
    },
  };
  const stored = { role: "assistant", content: "earlier", metadata: { anvia: { generation } } };

  async function firstEvent(manager: RunManager, thread: RunThread) {
    const stream = manager.events(thread, new AbortController().signal);
    const first = (await stream.next()).value;
    await stream.return(undefined);
    return first;
  }

  test("a thread's snapshot counts its stored history plus the run in progress", async () => {
    const events: RunEvent[] = [
      { type: "usage", turn, context: { usedTokens: 100, contextWindow: 1000 } },
    ];
    const { handle, finish } = liveRun();
    const manager = managerRunning(
      {
        ...handle,
        events: (async function* () {
          yield* events;
          await handle.result;
        })(),
      },
      { load: async () => [stored] as never },
    );
    const thread = newThread();
    await manager.start(thread, "hi");
    await Bun.sleep(20);

    expect(await firstEvent(manager, thread)).toMatchObject({
      running: true,
      usage: {
        totals: { inputTokens: 9, outputTokens: 4, cacheWriteTokens: 6, cacheReadTokens: 8 },
        context: { usedTokens: 100, contextWindow: 1000 },
      },
    });
    finish();
  });

  test("with no run, the snapshot is read from the stored messages", async () => {
    const manager = managerRunning(liveRun().handle, { load: async () => [stored] as never });
    expect(await firstEvent(manager, newThread())).toMatchObject({
      running: false,
      usage: {
        totals: { inputTokens: 8, outputTokens: 2, cacheWriteTokens: 3, cacheReadTokens: 4 },
      },
    });
  });
});
