import { describe, expect, test } from "bun:test";

import { INITIAL_THREAD_STREAM_STATE, reduceThreadStream } from "./thread-stream-state";

describe("reduceThreadStream", () => {
  test("hydrates snapshot state and preserves prior limits when snapshot omits them", () => {
    const withLimits = reduceThreadStream(INITIAL_THREAD_STREAM_STATE, {
      type: "event",
      now: 1000,
      event: {
        type: "limits",
        limits: [{ window: "session", status: "allowed", percent: 25 }],
      },
    });
    const snapped = reduceThreadStream(withLimits, {
      type: "event",
      now: 5000,
      event: {
        type: "snapshot",
        messages: [],
        hidden: 12,
        running: true,
        runningMs: 1200,
        usage: {
          inputTokens: 10,
          outputTokens: 5,
          cachedInputTokens: 0,
          totalTokens: 15,
        },
        steers: [{ id: "s1", prompt: "focus on tests" }],
      },
    });

    expect(snapped.synced).toBe(true);
    expect(snapped.hidden).toBe(12);
    expect(snapped.running).toBe(true);
    expect(snapped.startedAt).toBe(3800);
    expect(snapped.steers).toEqual([{ id: "s1", prompt: "focus on tests" }]);
    expect(snapped.usage?.limits).toEqual([{ window: "session", status: "allowed", percent: 25 }]);
  });

  test("ignores stale earlier page when hidden cursor already changed", () => {
    const snapped = reduceThreadStream(INITIAL_THREAD_STREAM_STATE, {
      type: "event",
      now: 1000,
      event: { type: "snapshot", messages: [], hidden: 10, running: false },
    });
    const stale = reduceThreadStream(snapped, {
      type: "earlier_loaded",
      before: 20,
      hidden: 5,
      messages: [{ role: "user", parts: [{ type: "text", text: "old" }] }],
    });
    expect(stale).toBe(snapped);

    const fresh = reduceThreadStream(snapped, {
      type: "earlier_loaded",
      before: 10,
      hidden: 0,
      messages: [{ role: "user", parts: [{ type: "text", text: "older" }] }],
    });
    expect(fresh.hidden).toBe(0);
    expect(fresh.earlier).toHaveLength(1);
  });

  test("queues and rejects steers in sequence and records rejection notice in reducer state", () => {
    const queued = reduceThreadStream(INITIAL_THREAD_STREAM_STATE, {
      type: "event",
      now: 1000,
      event: { type: "steer_queued", id: "s1", prompt: "stop and check" },
    });
    expect(queued.steers).toHaveLength(1);

    const after = reduceThreadStream(queued, {
      type: "event",
      now: 2000,
      event: { type: "steer_rejected", id: "s1", reason: "Run ended" },
    });
    expect(after.steers).toEqual([]);
    expect(after.rejectedNotice).toEqual({
      id: "s1",
      prompt: "stop and check",
      reason: "Run ended",
    });
  });

  test("hydrates narrations from snapshots and applies live narration events", () => {
    const snapped = reduceThreadStream(INITIAL_THREAD_STREAM_STATE, {
      type: "event",
      now: 1000,
      event: {
        type: "snapshot",
        messages: [],
        running: true,
        narrations: {
          t1: { toolId: "t1", label: "Patching export.ts", outcome: "Added null check" },
        },
      },
    });
    expect(snapped.narrations.t1?.label).toBe("Patching export.ts");

    const updated = reduceThreadStream(snapped, {
      type: "event",
      now: 1500,
      event: {
        type: "narration",
        narration: {
          toolId: "t2",
          label: "Running tests",
          outcome: "84/84 passed",
          tone: "success",
        },
      },
    });
    expect(updated.narrations.t1?.label).toBe("Patching export.ts");
    expect(updated.narrations.t2).toEqual({
      toolId: "t2",
      label: "Running tests",
      outcome: "84/84 passed",
      tone: "success",
    });
  });

  test("manages optimistic and server sandboxPhase across send, output, cancel, error, disconnect, and snapshot", () => {
    const pendingItem = {
      id: "p1",
      message: {
        id: "pending-p1",
        role: "user" as const,
        parts: [{ type: "text" as const, text: "hi" }],
      },
    };

    const nonSandbox = reduceThreadStream(INITIAL_THREAD_STREAM_STATE, {
      type: "pending_add",
      item: pendingItem,
      sandbox: false,
    });
    expect(nonSandbox.sandboxPhase).toBeNull();

    const optimistic = reduceThreadStream(INITIAL_THREAD_STREAM_STATE, {
      type: "pending_add",
      item: pendingItem,
      sandbox: true,
    });
    expect(optimistic.sandboxPhase).toBe("preparing");
    expect(optimistic.sandboxOptimistic).toBe(true);

    const emptySnapshot = reduceThreadStream(optimistic, {
      type: "event",
      now: 900,
      event: { type: "snapshot", messages: [], running: false },
    });
    expect(emptySnapshot.sandboxPhase).toBe("preparing");
    expect(emptySnapshot.sandboxOptimistic).toBe(true);

    const populatedSnapshot = reduceThreadStream(optimistic, {
      type: "event",
      now: 950,
      event: {
        type: "snapshot",
        messages: [{ id: "m-0", role: "user", parts: [{ type: "text", text: "existing" }] }],
        running: false,
      },
    });
    expect(populatedSnapshot.sandboxPhase).toBeNull();
    expect(populatedSnapshot.sandboxOptimistic).toBe(false);

    const dropped = reduceThreadStream(optimistic, { type: "pending_drop", id: "p1" });
    expect(dropped.sandboxPhase).toBeNull();

    const warmStarted = reduceThreadStream(optimistic, {
      type: "event",
      now: 1000,
      event: { type: "run_start", prompt: "hi" },
    });
    expect(warmStarted.sandboxPhase).toBe("preparing");

    const warmTool = reduceThreadStream(warmStarted, {
      type: "event",
      now: 1200,
      event: {
        type: "tool_start",
        tool: { id: "t1", name: "list_files", target: ".", status: "running" },
      },
    });
    expect(warmTool.sandboxPhase).toBe("ready");

    const cancelledMidPrep = reduceThreadStream(warmStarted, {
      type: "event",
      now: 1500,
      event: { type: "done" },
    });
    expect(cancelledMidPrep.sandboxPhase).toBeNull();

    const serverPreparing = reduceThreadStream(warmStarted, {
      type: "event",
      now: 1100,
      event: { type: "sandbox_status", phase: "preparing" },
    });
    expect(serverPreparing.sandboxPhase).toBe("preparing");
    expect(serverPreparing.sandboxOptimistic).toBe(false);

    const waitingOnWakeTool = reduceThreadStream(serverPreparing, {
      type: "event",
      now: 1200,
      event: {
        type: "tool_start",
        tool: { id: "t1", name: "list_files", target: ".", status: "running" },
      },
    });
    expect(waitingOnWakeTool.sandboxPhase).toBe("preparing");

    const serverCleared = reduceThreadStream(serverPreparing, {
      type: "event",
      now: 1300,
      event: { type: "sandbox_status", phase: null },
    });
    expect(serverCleared.sandboxPhase).toBeNull();

    const serverReady = reduceThreadStream(serverPreparing, {
      type: "event",
      now: 2000,
      event: { type: "sandbox_status", phase: "ready" },
    });
    expect(serverReady.sandboxPhase).toBe("ready");

    const doneWithOutput = reduceThreadStream(
      reduceThreadStream(serverPreparing, {
        type: "event",
        now: 1800,
        event: { type: "text", delta: "Done" },
      }),
      { type: "event", now: 1900, event: { type: "done", workedMs: 900 } },
    );
    expect(doneWithOutput.sandboxPhase).toBe("ready");

    const erroredAfterReady = reduceThreadStream(serverReady, {
      type: "event",
      now: 3000,
      event: { type: "error", message: "later failure" },
    });
    expect(erroredAfterReady.sandboxPhase).toBe("ready");

    const erroredWhilePreparing = reduceThreadStream(serverPreparing, {
      type: "event",
      now: 3000,
      event: { type: "error", message: "boot failed" },
    });
    expect(erroredWhilePreparing.sandboxPhase).toBeNull();

    const lostWhilePreparing = reduceThreadStream(serverPreparing, { type: "connection_lost" });
    expect(lostWhilePreparing.sandboxPhase).toBeNull();

    const snapped = reduceThreadStream(INITIAL_THREAD_STREAM_STATE, {
      type: "event",
      now: 4000,
      event: {
        type: "snapshot",
        messages: [],
        running: false,
        sandboxPhase: "preparing",
      },
    });
    expect(snapped.sandboxPhase).toBe("preparing");
  });
});
