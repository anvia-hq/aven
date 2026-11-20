import { describe, expect, test } from "bun:test";

import { realClock } from "./clock";

describe("realClock", () => {
  test("now returns the current timestamp", () => {
    const before = Date.now();
    const value = realClock.now();
    const after = Date.now();
    expect(value).toBeGreaterThanOrEqual(before);
    expect(value).toBeLessThanOrEqual(after);
  });

  test("sleep resolves after the delay and cleans up its abort listener", async () => {
    const controller = new AbortController();
    let added = 0;
    let removed = 0;
    const { signal } = controller;
    const origAdd = signal.addEventListener.bind(signal);
    const origRemove = signal.removeEventListener.bind(signal);
    signal.addEventListener = (...args: Parameters<typeof origAdd>) => {
      added += 1;
      origAdd(...args);
    };
    signal.removeEventListener = (...args: Parameters<typeof origRemove>) => {
      removed += 1;
      origRemove(...args);
    };

    await realClock.sleep(5, signal);

    expect(added).toBe(1);
    expect(removed).toBe(1);
  });

  test("sleep rejects immediately when the signal is already aborted", async () => {
    const controller = new AbortController();
    const reason = new Error("already stopped");
    controller.abort(reason);

    const started = Date.now();
    await expect(realClock.sleep(60_000, controller.signal)).rejects.toBe(reason);
    expect(Date.now() - started).toBeLessThan(100);
  });

  test("sleep clears its timer and rejects when aborted mid-sleep", async () => {
    const controller = new AbortController();
    const reason = new Error("cancelled mid-wait");
    const sleeping = realClock.sleep(60_000, controller.signal);

    const started = Date.now();
    setTimeout(() => controller.abort(reason), 5);

    await expect(sleeping).rejects.toBe(reason);
    expect(Date.now() - started).toBeLessThan(500);
  });
});
