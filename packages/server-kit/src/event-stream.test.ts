import { describe, expect, test } from "bun:test";

import { followStream } from "./event-stream";
import { createPoller } from "./poller";

describe("createPoller", () => {
  test("coalesces overlapping ticks and reports errors", async () => {
    let active = 0;
    let maxActive = 0;
    let calls = 0;
    const poller = createPoller({
      intervalMs: 1000,
      async run() {
        calls++;
        active++;
        maxActive = Math.max(maxActive, active);
        await Bun.sleep(10);
        active--;
      },
      onError() {},
    });
    await Promise.all([poller.tick(), poller.tick()]);
    expect(calls).toBe(1);
    expect(maxActive).toBe(1);
    await poller.close();
  });
});

describe("followStream", () => {
  test("yields initial item, queued updates, keepalive pings, and detaches on abort", async () => {
    let pushItem: ((v: string) => void) | undefined;
    let detached = false;
    const controller = new AbortController();
    const stream = followStream<string>({
      attach(push) {
        pushItem = push;
        return () => {
          detached = true;
        };
      },
      initial: () => "first",
      signal: controller.signal,
      pingMs: 15,
    });

    expect((await stream.next()).value).toBe("first");
    pushItem?.("second");
    expect((await stream.next()).value).toBe("second");
    expect((await stream.next()).value).toBeNull();

    controller.abort();
    expect((await stream.next()).done).toBe(true);
    expect(detached).toBe(true);
  });
});
