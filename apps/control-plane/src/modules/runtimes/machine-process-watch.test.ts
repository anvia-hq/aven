import { describe, expect, test } from "bun:test";

import { MachineProcessWatch } from "./machine-process-watch";

type Sent = { threadId: string; phase: string };

function calls() {
  const sent: Sent[] = [];
  let online = true;
  let fail: Error | undefined;
  let drop = false;
  const watch = new MachineProcessWatch((runtimeId) => {
    if (!online || runtimeId !== "machine") return undefined;
    return {
      call: async (method, params) => {
        if (drop) {
          online = false;
          throw new Error("The runtime disconnected");
        }
        if (fail) throw fail;
        sent.push({
          threadId: (params as { threadId: string }).threadId,
          phase: (params as { phase: string }).phase,
        });
        if (method !== "process.watch") throw new Error(method);
        return null;
      },
    };
  });
  return {
    sent,
    watch,
    offline: () => (online = false),
    online: () => (online = true),
    failWith: (error?: Error) => (fail = error),
    dropOnCall: () => (drop = true),
    stopDropping: () => (drop = false),
  };
}

describe("telling a machine to watch the processes an agent started there", () => {
  test("settles when the run ends with a response, and suspends when it does not", async () => {
    const t = calls();
    await t.watch.ended("machine", "thread-1", "response");
    await t.watch.ended("machine", "thread-1", "interaction");
    await t.watch.ended("machine", "thread-2", "error");
    await t.watch.ended("machine", "thread-2", "lost");
    expect(t.sent).toEqual([
      { threadId: "thread-1", phase: "settle" },
      { threadId: "thread-1", phase: "suspend" },
      { threadId: "thread-2", phase: "suspend" },
      { threadId: "thread-2", phase: "suspend" },
    ]);
  });

  test("a run on the machine's own agent is not told, it watches that itself", async () => {
    const t = calls();
    await t.watch.ended(undefined, "thread-1", "response");
    expect(t.sent).toEqual([]);
  });

  test("waits while the machine is offline and tells it when it connects", async () => {
    const t = calls();
    t.offline();
    await t.watch.ended("machine", "thread-1", "response");
    await t.watch.ended("machine", "thread-1", "interaction");
    expect(t.sent).toEqual([]);
    t.online();
    await t.watch.hello("machine");
    expect(t.sent).toEqual([{ threadId: "thread-1", phase: "suspend" }]);
  });

  test("a machine that refuses the call is asked once", async () => {
    const t = calls();
    t.failWith(new Error("Unknown call process.watch"));
    await t.watch.ended("machine", "thread-1", "response");
    t.failWith();
    await t.watch.hello("machine");
    expect(t.sent).toEqual([]);
  });

  test("a call that fails because the machine dropped is sent when it connects", async () => {
    const t = calls();
    t.dropOnCall();
    await t.watch.ended("machine", "thread-1", "response");
    t.stopDropping();
    t.online();
    await t.watch.hello("machine");
    expect(t.sent).toEqual([{ threadId: "thread-1", phase: "settle" }]);
  });
});
