import { describe, expect, test } from "bun:test";

import type { ProcessView, RuntimeToControlPlane } from "@aven/protocol/runtime-wire";

import { ProcessEndWatch } from "./process-end-watch";
import type { ThreadSandbox } from "./sandbox";

const proc = (id: string, status: ProcessView["status"], exitCode?: number): ProcessView => ({
  id,
  command: `cmd ${id}`,
  status,
  exitCode,
  startedAt: "2026-11-07T10:00:00.000Z",
  endedAt: status === "running" ? undefined : "2026-11-07T10:01:30.000Z",
});

function setup(initial: ProcessView[]) {
  let list = initial;
  const sent: RuntimeToControlPlane[] = [];
  let hasRun = false;
  const box = {
    processes: {
      list: async () => list,
      logs: async () => ({ stdout: "out", stderr: "err", truncated: false }),
    },
  } as unknown as ThreadSandbox;
  const watch = new ProcessEndWatch({
    box: () => box,
    send: (message) => (sent.push(message), true),
    hasRun: () => hasRun,
    stopped: () => false,
    pollMs: 5,
  });
  return {
    watch,
    sent,
    set: (next: ProcessView[]) => (list = next),
    run: (value: boolean) => (hasRun = value),
  };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 30));

describe("the end of a process the agent left running (decision 0144)", () => {
  test("tells the control plane once when a watched process ends, with its end of output", async () => {
    const t = setup([proc("a", "running"), proc("b", "running")]);
    await t.watch.arm("thread-1");
    t.set([proc("a", "exited", 0), proc("b", "running")]);
    await tick();
    t.set([proc("a", "exited", 0), proc("b", "running")]);
    await tick();
    expect(t.sent).toEqual([
      {
        type: "process.ended",
        threadId: "thread-1",
        processId: "a",
        command: "cmd a",
        status: "exited",
        exitCode: 0,
        ranSeconds: 90,
        stdout: "out",
        stderr: "err",
      },
    ]);
    t.watch.cancelAll();
  });

  test("watches nothing when nothing runs, and drops the watch when a run starts", async () => {
    const none = setup([proc("a", "exited", 0)]);
    await none.watch.arm("thread-1");
    none.set([proc("a", "exited", 1)]);
    await tick();
    expect(none.sent).toEqual([]);

    const t = setup([proc("a", "running")]);
    await t.watch.arm("thread-1");
    t.watch.disarm("thread-1");
    t.set([proc("a", "exited", 0)]);
    await tick();
    expect(t.sent).toEqual([]);
  });

  test("says nothing while a run is going, or for a process the person stopped", async () => {
    const t = setup([proc("a", "running"), proc("b", "running")]);
    await t.watch.arm("thread-1");
    t.watch.ignore("thread-1", "a");
    t.set([proc("a", "stopped"), proc("b", "exited", 0)]);
    await tick();
    expect(t.sent.map((m) => (m.type === "process.ended" ? m.processId : ""))).toEqual(["b"]);

    const busy = setup([proc("a", "running")]);
    await busy.watch.arm("thread-1");
    busy.run(true);
    busy.set([proc("a", "exited", 0)]);
    await tick();
    expect(busy.sent).toEqual([]);
  });
});
