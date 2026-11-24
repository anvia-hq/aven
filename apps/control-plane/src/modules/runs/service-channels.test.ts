import { describe, expect, test } from "bun:test";

import {
  memoryContinuations,
  memoryFailures,
  memoryLimits,
  memoryNarrations,
  memorySenders,
  memoryWorkedTimes,
} from "../../testing/memory-continuations";
import { RunManager } from "./service";
import type { ConversationStore } from "../../types";
import type { RunResult, RunThread, Runtime, RuntimeRun } from "./types";
import type { PlanLimit, RunEvent, ToolPart } from "@aven/protocol/types";

type FakeRun = {
  handle: RuntimeRun;
  emit(event: RunEvent): void;
  say(delta: string): void;
  report(limits: PlanLimit[]): void;
  finish(outcome?: RunResult): void;
};

function fakeRun(): FakeRun {
  const done = Promise.withResolvers<RunResult>();
  const said: RunEvent[] = [];
  let finished = false;
  const handle: RuntimeRun = {
    events: {
      [Symbol.asyncIterator]: () => ({
        next: async () => {
          for (;;) {
            const event = said.shift();

            if (event) return { done: false as const, value: event };

            if (finished) return { done: true as const, value: undefined };

            await Bun.sleep(2);
          }
        },
      }),
    },
    result: done.promise,
    cancel: () => undefined,
    steer: async () => ({ status: "closed" as const }),
  };
  return {
    handle,
    emit: (event) => void said.push(event),
    say: (delta) => void said.push({ type: "text", delta }),
    report: (limits) => void said.push({ type: "limits", limits }),
    finish: (outcome: RunResult = { type: "response" }) => {
      finished = true;
      done.resolve(outcome);
    },
  };
}

function scriptedRuntime() {
  const runs: FakeRun[] = [];
  const open = async () => {
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
    workedTimes: memoryWorkedTimes().store,
    senders: memorySenders().store,
    limits: memoryLimits().store,
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

describe("how long a run worked", () => {
  test("is told with done and kept for the answer's place in the thread", async () => {
    const times = memoryWorkedTimes();
    const { runtime, current } = scriptedRuntime();
    const manager = managerFor(runtime, { workedTimes: times.store });
    const thread = newThread();
    const watcher = attach(manager, thread);

    await manager.start(thread, "one");
    current().say("hello");
    current().finish({ type: "response" });
    await until(() => !manager.isRunning(thread.id));
    await until(() => (times.saved.get(thread.id)?.size ?? 0) > 0);
    await watcher.detach();

    const done = watcher.events.find((event) => event.type === "done");
    expect(done?.type === "done" && done.workedMs).toBeGreaterThanOrEqual(0);
    expect(await times.store.read(thread.id)).toEqual(new Map([[1, expect.any(Number)]]));
  });
});

describe("who sent a message", () => {
  test("is kept for the message's place in the thread", async () => {
    const senders = memorySenders();
    const { runtime, current } = scriptedRuntime();
    const manager = managerFor(runtime, { senders: senders.store });
    const thread = newThread();
    const watcher = attach(manager, thread);

    await manager.start(thread, "one", undefined, { senderId: "user-1" });
    current().say("hello");
    current().finish({ type: "response" });
    await until(() => !manager.isRunning(thread.id));
    await watcher.detach();

    expect(await senders.store.read(thread.id)).toEqual(new Map([[0, "user-1"]]));
  });
});

describe("a run that produced nothing", () => {
  test("keeps no time, so it does not add to the answer before it", async () => {
    const times = memoryWorkedTimes();
    const { runtime, current } = scriptedRuntime();
    const manager = managerFor(runtime, { workedTimes: times.store });
    const thread = newThread();
    const watcher = attach(manager, thread);

    await manager.start(thread, "one");
    current().finish({ type: "response" });
    await until(() => !manager.isRunning(thread.id));
    await Bun.sleep(30);
    expect(times.saved.get(thread.id)?.size ?? 0).toBe(0);
    await watcher.detach();
    expect(watcher.events.find((event) => event.type === "done")).toEqual({ type: "done" });
  });
});

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

describe("a message that starts no run", () => {
  test("is kept in the thread's history and shown to whoever is watching the idle thread", async () => {
    const appended: { messages: unknown[] }[] = [];
    const store = {
      load: async () => appended.flatMap(({ messages }) => messages),
      append: async (entry: { messages: unknown[] }) => {
        appended.push(entry);
      },
    } as unknown as ConversationStore;
    const { runtime } = scriptedRuntime();
    const senders = memorySenders();
    const manager = managerFor(runtime, { store, senders: senders.store });
    const thread = newThread();
    const watcher = attach(manager, thread);
    await until(() => watcher.events.length > 0);

    await manager.note(thread, "[driver: Randy] hello Indra", "user-randy");
    await until(() => watcher.events.length > 1);
    await watcher.detach();

    expect(appended).toHaveLength(1);
    expect(appended[0]?.messages).toEqual([
      { role: "user", content: "[driver: Randy] hello Indra" },
    ]);
    const shown = watcher.events.at(-1);
    expect(shown?.type === "snapshot" && shown.messages.map((m) => m.role)).toEqual(["user"]);
    expect(shown?.type === "snapshot" && shown.messages[0]?.senderId).toBe("user-randy");
    expect(await senders.store.read(thread.id)).toEqual(new Map([[0, "user-randy"]]));
    expect(manager.isRunning(thread.id)).toBe(false);
  });
});

describe("the plan limits a run reported", () => {
  const snapshotOf = async (manager: RunManager, thread: RunThread) => {
    const watcher = attach(manager, thread);
    await until(() => watcher.events.some((event) => event.type === "snapshot"));
    await watcher.detach();
    const snapshot = watcher.events.find((event) => event.type === "snapshot");
    return snapshot?.type === "snapshot" ? snapshot : undefined;
  };

  test("are in the snapshot of a thread opened again, with none that have already reset", async () => {
    const limits = memoryLimits();
    const { runtime, current } = scriptedRuntime();
    const manager = managerFor(runtime, { limits: limits.store });
    const thread = newThread();
    const week: PlanLimit = {
      window: "seven_day",
      status: "allowed",
      percent: 81,
      resetsAt: Date.now() + 1e8,
    };
    const hours: PlanLimit = {
      window: "five_hour",
      status: "allowed",
      percent: 12,
      resetsAt: Date.now() - 1,
    };

    await manager.start(thread, "one");
    current().report([week, hours]);
    current().finish({ type: "response" });
    await until(() => !manager.isRunning(thread.id));
    await until(() => (limits.saved.get(thread.id)?.length ?? 0) === 2);

    const later = managerFor(runtime, { limits: limits.store });
    expect((await snapshotOf(later, thread))?.usage?.limits).toEqual([week]);
  });

  test("are in the snapshot of a run that has only just begun", async () => {
    const limits = memoryLimits();
    const thread = newThread();
    const week = { window: "seven_day", status: "allowed_warning", percent: 90 } as PlanLimit;
    await limits.store.record(thread.id, [week]);
    const { runtime } = scriptedRuntime();
    const manager = managerFor(runtime, { limits: limits.store });

    await manager.start(thread, "one");

    expect((await snapshotOf(manager, thread))?.usage?.limits).toEqual([week]);
  });
});

describe("draining before a shutdown", () => {
  test("waits for a running thread, refuses a new run meanwhile, and returns once none is left", async () => {
    const { runtime, current } = scriptedRuntime();
    const manager = managerFor(runtime);
    const working = newThread();

    await manager.start(working, "one");
    expect(manager.runningCount()).toBe(1);

    const draining = manager.drain(5000);

    await expect(manager.start(newThread(), "two")).rejects.toThrow("restarting");

    current().finish();
    expect(await draining).toBe(0);
  });

  test("gives up at the deadline and says how many runs are still working", async () => {
    const { runtime } = scriptedRuntime();
    const manager = managerFor(runtime);

    await manager.start(newThread(), "one");

    expect(await manager.drain(300)).toBe(1);
  });

  test("returns at once when nothing is running", async () => {
    const manager = managerFor(scriptedRuntime().runtime);
    const started = Date.now();

    expect(await manager.drain(5000)).toBe(0);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

describe("sidecar tool narrations", () => {
  const editTool = (id: string): ToolPart => ({
    id,
    name: "edit",
    target: `src/${id}.ts`,
    status: "running",
  });

  test("persists narrations, broadcasts to live subscribers, hydrates snapshots, and bounds concurrency", async () => {
    const narrations = memoryNarrations();
    const { runtime, current } = scriptedRuntime();
    let inFlight = 0;
    let peak = 0;
    const gates: PromiseWithResolvers<void>[] = [];

    const manager = managerFor(runtime, {
      narrations: narrations.store,
      narrator: {
        narrate: async (tool) => {
          inFlight += 1;
          peak = Math.max(peak, inFlight);
          const gate = Promise.withResolvers<void>();
          gates.push(gate);
          await gate.promise;
          inFlight -= 1;
          return { toolId: tool.id, label: `Patched ${tool.id}`, tone: "success" };
        },
      },
    });

    const thread = newThread();
    const watcher = attach(manager, thread);
    await until(() => watcher.events.some((event) => event.type === "snapshot"));

    await manager.start(thread, "fix four files");
    for (const id of ["t1", "t2", "t3", "t4"]) {
      current().emit({ type: "tool_start", tool: editTool(id) });
      current().emit({ type: "tool_end", id, status: "done", output: "ok" });
    }

    await until(() => gates.length === 2);
    await Bun.sleep(20);
    expect(peak).toBe(2);

    gates[0]!.resolve();
    gates[1]!.resolve();
    await until(() => gates.length === 4);

    current().finish({ type: "response" });
    await until(() => !manager.isRunning(thread.id));

    gates[2]!.resolve();
    gates[3]!.resolve();

    await until(() => watcher.events.filter((event) => event.type === "narration").length === 4);
    await watcher.detach();

    const stored = await narrations.store.read(thread.id);
    expect(Object.keys(stored).sort()).toEqual(["t1", "t2", "t3", "t4"]);

    const reconnected = attach(manager, thread);
    await until(() => reconnected.events.some((event) => event.type === "snapshot"));
    await reconnected.detach();
    const snap = reconnected.events.find((event) => event.type === "snapshot");
    expect(snap?.type === "snapshot" && Object.keys(snap.narrations ?? {}).sort()).toEqual([
      "t1",
      "t2",
      "t3",
      "t4",
    ]);
  });

  test("aborts pending narrations when a run is cancelled", async () => {
    const narrations = memoryNarrations();
    const { runtime, current } = scriptedRuntime();
    let aborted = false;
    const manager = managerFor(runtime, {
      narrations: narrations.store,
      narrator: {
        narrate: async (_tool, signal) => {
          await new Promise<void>((resolve) => {
            signal?.addEventListener("abort", () => {
              aborted = true;
              resolve();
            });
          });
          return { toolId: "t1", label: "Should not emit" };
        },
      },
    });
    const thread = newThread();

    await manager.start(thread, "edit");
    current().emit({ type: "tool_start", tool: editTool("t1") });
    current().emit({ type: "tool_end", id: "t1", status: "done", output: "ok" });
    await Bun.sleep(20);

    manager.cancel(thread.id);
    current().finish({ type: "response" });
    await until(() => !manager.isRunning(thread.id));
    await until(() => aborted);

    expect(await narrations.store.read(thread.id)).toEqual({});
  });
});

describe("sandbox preparation status", () => {
  const sandboxPhases = (events: RunEvent[]) =>
    events.flatMap((event) => (event.type === "sandbox_status" ? [event.phase] : []));

  test("broadcasts preparing before run_start, hydrates snapshots, deduplicates preparing, and stays ready", async () => {
    const bootGate = Promise.withResolvers<void>();
    const { runtime: base, current } = scriptedRuntime();
    const runtime: typeof base = {
      ...base,
      async start(input) {
        await input.onSandboxPhase?.("preparing");
        await bootGate.promise;
        return { ...(await base.start(input)), sandbox: true };
      },
    };
    const manager = managerFor(runtime);
    const thread = newThread();

    const watcher = attach(manager, thread);
    await until(() => watcher.events.some((event) => event.type === "snapshot"));

    const starting = manager.start(thread, "first message");
    await until(() => sandboxPhases(watcher.events).includes("preparing"));

    const midBoot = attach(manager, thread);
    await until(() => midBoot.events.some((event) => event.type === "snapshot"));
    const midSnap = midBoot.events.find((event) => event.type === "snapshot");
    expect(midSnap?.type === "snapshot" && midSnap.sandboxPhase).toBe("preparing");
    await midBoot.detach();

    bootGate.resolve();
    await starting;

    current().emit({ type: "sandbox_status", phase: "preparing" });
    current().emit({ type: "sandbox_status", phase: "ready" });
    current().emit({ type: "text", delta: "Done." });
    current().finish({ type: "response" });
    await until(() => !manager.isRunning(thread.id));
    await until(() => watcher.events.some((event) => event.type === "done"));

    expect(sandboxPhases(watcher.events)).toEqual(["preparing", "ready"]);

    const after = attach(manager, thread);
    await until(() => after.events.some((event) => event.type === "snapshot"));
    const afterSnap = after.events.find((event) => event.type === "snapshot");
    expect(afterSnap?.type === "snapshot" && afterSnap.sandboxPhase).toBe("ready");
    await after.detach();
    await watcher.detach();
  });

  test("broadcasts clear to live subscribers when runtime start throws before a run begins", async () => {
    const { runtime: base } = scriptedRuntime();
    const runtime: typeof base = {
      ...base,
      async start(input) {
        await input.onSandboxPhase?.("preparing");
        throw new Error("cloud boot failed");
      },
    };
    const manager = managerFor(runtime);
    const thread = newThread();

    const live = attach(manager, thread);
    await until(() => live.events.some((event) => event.type === "snapshot"));

    await expect(manager.start(thread, "first message")).rejects.toThrow("cloud boot failed");
    await until(() => sandboxPhases(live.events).length === 2);
    expect(sandboxPhases(live.events)).toEqual(["preparing", null]);
    await live.detach();

    const after = attach(manager, thread);
    await until(() => after.events.some((event) => event.type === "snapshot"));
    const snap = after.events.find((event) => event.type === "snapshot");
    expect(snap?.type === "snapshot" && snap.sandboxPhase).toBeUndefined();
    await after.detach();
  });

  test("clears preparing when cancelled mid-prep and resolves to ready on question outcome", async () => {
    const { runtime: base, current } = scriptedRuntime();
    const runtime: typeof base = {
      ...base,
      async start(input) {
        await input.onSandboxPhase?.("preparing");
        return { ...(await base.start(input)), sandbox: true };
      },
    };
    const manager = managerFor(runtime);

    const cancelledThread = newThread();
    const cancelWatcher = attach(manager, cancelledThread);
    await until(() => cancelWatcher.events.some((event) => event.type === "snapshot"));
    await manager.start(cancelledThread, "first");
    manager.cancel(cancelledThread.id);
    current().finish({ type: "response" });
    await until(() => cancelWatcher.events.some((event) => event.type === "done"));
    expect(sandboxPhases(cancelWatcher.events)).toEqual(["preparing", null]);
    await cancelWatcher.detach();

    const questionThread = newThread();
    const questionWatcher = attach(manager, questionThread);
    await until(() => questionWatcher.events.some((event) => event.type === "snapshot"));
    await manager.start(questionThread, "ask me");
    current().emit({
      type: "tool_start",
      tool: {
        id: "q1",
        name: "ask_user",
        target: "",
        status: "running",
        questions: [{ id: "a", text: "Pick one" }],
      },
    });
    current().finish({
      type: "interaction",
      continuation: {
        version: 1,
        agentId: "run-1",
        sourceRunId: "d1",
        interaction: {
          type: "tool-question",
          id: "i1",
          toolName: "ask_user",
          toolCallId: "q1",
          internalCallId: "ic1",
          questions: [{ id: "a", text: "Pick one" }],
        },
        state: {},
      },
    });
    await until(() => questionWatcher.events.some((event) => event.type === "done"));
    expect(sandboxPhases(questionWatcher.events)).toEqual(["preparing", "ready"]);
    await questionWatcher.detach();
  });

  test("ignores sandbox_status from non-sandbox runners and does not emit on subsequent turns after channel release", async () => {
    const { runtime: base, current } = scriptedRuntime();
    const historyMessages = [
      { role: "user" as const, content: "earlier" },
      { role: "assistant" as const, content: "replied" },
    ];
    let allowSandbox = false;
    const runtime: typeof base = {
      ...base,
      async start(input) {
        await input.onSandboxPhase?.("preparing");
        return { ...(await base.start(input)), sandbox: allowSandbox };
      },
    };
    const store = {
      load: async () => historyMessages,
    } as unknown as ConversationStore;
    const manager = managerFor(runtime, { store });

    const spoofThread = newThread();
    const spoofRuntime: typeof base = {
      ...base,
      async start(input) {
        return { ...(await base.start(input)), sandbox: false };
      },
    };
    const spoofManager = managerFor(spoofRuntime);
    const spoofWatcher = attach(spoofManager, spoofThread);
    await until(() => spoofWatcher.events.some((event) => event.type === "snapshot"));
    await spoofManager.start(spoofThread, "hi");
    current().emit({ type: "sandbox_status", phase: "preparing" });
    current().emit({ type: "sandbox_status", phase: "ready" });
    current().finish({ type: "response" });
    await until(() => spoofWatcher.events.some((event) => event.type === "done"));
    expect(sandboxPhases(spoofWatcher.events)).toEqual([]);
    await spoofWatcher.detach();

    allowSandbox = true;
    const secondTurnThread = newThread();
    const secondWatcher = attach(manager, secondTurnThread);
    await until(() => secondWatcher.events.some((event) => event.type === "snapshot"));
    await manager.start(secondTurnThread, "second message");
    current().emit({ type: "sandbox_status", phase: "preparing" });
    current().emit({ type: "sandbox_status", phase: "ready" });
    current().finish({ type: "response" });
    await until(() => secondWatcher.events.some((event) => event.type === "done"));
    expect(sandboxPhases(secondWatcher.events)).toEqual([]);
    await secondWatcher.detach();
  });

  test("resolves preparing to ready automatically when an older runner emits text without sandbox_status", async () => {
    const { runtime: base, current } = scriptedRuntime();
    const runtime: typeof base = {
      ...base,
      async start(input) {
        await input.onSandboxPhase?.("preparing");
        return { ...(await base.start(input)), sandbox: true };
      },
    };
    const manager = managerFor(runtime);
    const thread = newThread();
    const watcher = attach(manager, thread);
    await until(() => watcher.events.some((event) => event.type === "snapshot"));

    await manager.start(thread, "hello");
    current().emit({ type: "text", delta: "hi there" });
    current().finish({ type: "response" });
    await until(() => watcher.events.some((event) => event.type === "done"));

    expect(sandboxPhases(watcher.events)).toEqual(["preparing", "ready"]);
    await watcher.detach();
  });
});
