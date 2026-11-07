import { describe, expect, test } from "bun:test";

import type { ProcessView, RuntimeToControlPlane } from "@aven/protocol/runtime-wire";

import { ProcessEndWatch } from "./process-end-watch";
import type { ThreadSandbox } from "./sandbox";

// What the sandbox's own clock says: it need not agree with the host's, so the watch never reads it.
const startedMs = Date.parse("2020-01-01T00:00:00.000Z");
const proc = (id: string, status: ProcessView["status"], exitCode?: number): ProcessView => ({
  id,
  command: `cmd ${id}`,
  status,
  exitCode,
  startedAt: new Date(startedMs).toISOString(),
  endedAt: status === "running" ? undefined : new Date(startedMs + 90_000).toISOString(),
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

const idsOf = (sent: RuntimeToControlPlane[]) =>
  sent.map((m) => (m.type === "process.ended" ? m.processId : ""));

describe("the end of a process the agent started (decisions 0144 and 0147)", () => {
  test("tells the control plane once when a watched process ends, with its end of output", async () => {
    const t = setup([]);
    t.run(true);
    t.watch.arm("thread-1");
    await tick();
    t.set([proc("a", "running"), proc("b", "running")]);
    await tick();
    t.set([proc("a", "exited", 0), proc("b", "running")]);
    await tick();
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

  test("tells of one that ends while the run is going, so the run hears it at its next step", async () => {
    const t = setup([]);
    t.run(true);
    t.watch.arm("thread-1");
    await tick();
    t.set([proc("a", "running")]);
    await tick();
    expect(t.sent).toEqual([]);
    t.set([proc("a", "exited", 0)]);
    await tick();
    expect(idsOf(t.sent)).toEqual(["a"]);
    t.watch.cancelAll();
  });

  test("tells of one that started and ended between two looks, once the run is over", async () => {
    const t = setup([]);
    t.run(true);
    t.watch.arm("thread-1");
    await tick();
    t.set([proc("quick", "exited", 0)]);
    t.run(false);
    t.watch.settle("thread-1");
    await tick();
    expect(idsOf(t.sent)).toEqual(["quick"]);
  });

  test("leaves alone a process the sandbox had before the watch began, and one the person stopped", async () => {
    const t = setup([proc("old", "running"), proc("older", "exited", 0)]);
    t.run(true);
    t.watch.arm("thread-1");
    await tick();
    t.set([proc("old", "exited", 0), proc("older", "exited", 0), proc("a", "running")]);
    await tick();
    t.watch.ignore("thread-1", "a");
    t.set([proc("old", "exited", 0), proc("older", "exited", 0), proc("a", "stopped")]);
    await tick();
    expect(t.sent).toEqual([]);
    t.watch.cancelAll();
  });

  test("goes when the run is over and nothing it started is running, and tells nothing after a disarm", async () => {
    const t = setup([]);
    t.run(true);
    t.watch.arm("thread-1");
    await tick();
    t.set([proc("a", "exited", 0)]);
    t.watch.disarm("thread-1");
    t.run(false);
    await tick();
    expect(t.sent).toEqual([]);

    const idle = setup([]);
    idle.run(true);
    idle.watch.arm("thread-1");
    await tick();
    idle.run(false);
    await tick();
    idle.set([proc("late", "exited", 0)]);
    await tick();
    expect(idle.sent).toEqual([]);
  });

  test("a run that stops on a question only suspends it: the next run still hears of a process that ended meanwhile", async () => {
    const t = setup([]);
    t.run(true);
    t.watch.arm("thread-1");
    await tick();
    t.set([proc("tests", "running")]);
    await tick();
    t.run(false);
    t.watch.suspend("thread-1");
    t.set([proc("tests", "exited", 0)]);
    await tick();
    expect(t.sent).toEqual([]);
    t.run(true);
    t.watch.arm("thread-1");
    await tick();
    expect(idsOf(t.sent)).toEqual(["tests"]);
    t.watch.cancelAll();
  });

  test("a suspended watch with nothing to follow is forgotten", async () => {
    const t = setup([]);
    t.run(true);
    t.watch.arm("thread-1");
    await tick();
    t.watch.suspend("thread-1");
    t.set([proc("new", "exited", 0)]);
    t.run(true);
    t.watch.arm("thread-1");
    await tick();
    expect(t.sent).toEqual([]);
    t.watch.cancelAll();
  });
});
