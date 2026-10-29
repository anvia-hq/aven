import { describe, expect, test } from "bun:test";

import type { ConversationStore } from "@aven/agents/memory";

import { RuntimeOfflineError } from "../runtimes/hub";
import type { Runtime, RunThread } from "./runtime";
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
