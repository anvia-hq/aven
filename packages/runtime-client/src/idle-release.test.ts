import { describe, expect, test } from "bun:test";

import { IdleRelease } from "./idle-release";
import type { ThreadSandbox, ThreadWorkspaces } from "./sandbox";

// A runner with one thread's sandbox up, whose run is going until the spec says otherwise.
function harness({ runUntil = 0, box = true } = {}) {
  const released: string[] = [];
  let stopped = false;
  const context = {
    sandbox: {
      release: async (threadId: string) => void released.push(threadId),
    } as unknown as Pick<ThreadWorkspaces, "release">,
    boxes: new Map<string, ThreadSandbox>(box ? [["t-1", {} as ThreadSandbox]] : []),
    idleMs: 60_000,
    stopped: () => stopped,
    hasRun: () => runUntil > Date.now(),
    isWatched: () => false,
  };
  return {
    released,
    idle: new IdleRelease(context),
    stop: () => {
      stopped = true;
    },
    setRunUntil: (at: number) => {
      runUntil = at;
    },
  };
}

describe("releaseNow", () => {
  test("frees the sandbox at once when nothing uses it, and says so", async () => {
    const { idle, released } = harness();

    expect(await idle.releaseNow("t-1")).toBe(true);
    expect(released).toEqual(["t-1"]);
  });

  test("has nothing to free for a thread with no sandbox up", async () => {
    const { idle, released } = harness({ box: false });

    expect(await idle.releaseNow("t-1")).toBe(false);
    expect(released).toEqual([]);
  });

  test("waits for a run that was just stopped to let go, then frees the sandbox", async () => {
    const { idle, released, setRunUntil } = harness({ runUntil: Date.now() + 250 });
    // The run ends on its own while the release waits.
    setTimeout(() => setRunUntil(0), 300);

    expect(await idle.releaseNow("t-1", 2_000)).toBe(true);
    expect(released).toEqual(["t-1"]);
  });

  test("leaves the sandbox to its idle release when the run does not end", async () => {
    const { idle, released } = harness({ runUntil: Date.now() + 60_000 });

    expect(await idle.releaseNow("t-1", 150)).toBe(false);
    expect(released).toEqual([]);
  });

  test("does nothing while the runner is shutting down", async () => {
    const { idle, released, stop } = harness();
    stop();

    expect(await idle.releaseNow("t-1")).toBe(false);
    expect(released).toEqual([]);
  });
});
