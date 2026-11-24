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
});
