import { describe, expect, test } from "bun:test";

import type { ConversationStore } from "@aven/agents/memory";
import type { RunEvent } from "@aven/protocol/events";

import { UnavailableError } from "../../errors";
import type { Runtime, RunThread, RuntimeRun } from "./runtime";
import { RunBusyError, RunManager } from "./service";

// A run that stays live until `finish`.
function liveRun() {
  const done = Promise.withResolvers<{ type: string }>();
  const handle: RuntimeRun = {
    events: {
      [Symbol.asyncIterator]: () => ({
        next: async () => (await done.promise, { done: true as const, value: undefined }),
      }),
    },
    result: done.promise,
    cancel: () => undefined,
  };
  return { handle, finish: () => done.resolve({ type: "response" }) };
}

function managerRunning(handle: RuntimeRun, store: Partial<ConversationStore> = {}) {
  const runtime: Runtime = { start: () => handle, dispose: () => undefined };
  return new RunManager({
    store: { load: async () => [], ...store } as ConversationStore,
    runtime,
    onRunFinished: () => undefined,
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
});

describe("context usage", () => {
  test("the latest one is in the snapshot of a client that attaches afterwards", async () => {
    const events: RunEvent[] = [
      { type: "context", usedTokens: 100, contextWindow: 1000 },
      { type: "context", usedTokens: 330, contextWindow: 1000 },
    ];
    const handle: RuntimeRun = {
      events: (async function* () {
        yield* events;
      })(),
      result: Promise.resolve({ type: "response" }),
      cancel: () => undefined,
    };
    const manager = managerRunning(handle);
    const thread = newThread();
    await manager.start(thread, "hi");
    await Bun.sleep(20);

    const stream = manager.events(thread, new AbortController().signal);
    const first = (await stream.next()).value;
    await stream.return(undefined);
    expect(first).toMatchObject({
      type: "snapshot",
      running: false,
      context: { usedTokens: 330, contextWindow: 1000 },
    });
  });
});
