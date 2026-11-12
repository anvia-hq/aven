import { describe, expect, test } from "bun:test";

import { openRunDatabase } from "./run-outbox";
import { ProcessEndWatch, ProcessWatchRecords } from "./process-end-watch";
import type { ProcessView, RuntimeToControlPlane } from "@aven/protocol/types";
import type { ThreadSandbox } from "./types";

const startedMs = Date.parse("2020-01-01T00:00:00.000Z");
const proc = (id: string, status: ProcessView["status"], exitCode?: number): ProcessView => ({
  id,
  command: `cmd ${id}`,
  status,
  exitCode,
  startedAt: new Date(startedMs).toISOString(),
  endedAt: status === "running" ? undefined : new Date(startedMs + 90_000).toISOString(),
});

function memoryStore() {
  const kept = new Map<
    string,
    { baseline: readonly string[]; tracked: readonly string[]; told: readonly string[] }
  >();
  return {
    load: (threadId: string) => kept.get(threadId),
    save: (
      threadId: string,
      watch: { baseline: readonly string[]; tracked: readonly string[]; told: readonly string[] },
    ) => void kept.set(threadId, structuredClone(watch)),
    clear: (threadId: string) => void kept.delete(threadId),
  };
}

type Store = ReturnType<typeof memoryStore>;

function setup(
  initial: ProcessView[],
  options: { store?: Store; world?: { current: ProcessView[] } } = {},
) {
  const world = options.world ?? { current: initial };
  const sent: RuntimeToControlPlane[] = [];
  let hasRun = false;
  const box = {
    processes: {
      list: async () => world.current,
      logs: async () => ({ stdout: "out", stderr: "err", truncated: false }),
    },
  } as unknown as ThreadSandbox;
  const watch = new ProcessEndWatch(
    {
      box: () => box,
      send: (message) => (sent.push(message), true),
      hasRun: () => hasRun,
      stopped: () => false,
      pollMs: 5,
    },
    options.store,
  );
  return {
    watch,
    sent,
    set: (next: ProcessView[]) => (world.current = next),
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

describe("an end the watch is told of survives a runner that restarts", () => {
  test("what the watch kept is read back from the runner's state database", () => {
    const db = openRunDatabase(":memory:");
    new ProcessWatchRecords(db).save("thread-1", {
      baseline: ["old"],
      tracked: ["a"],
      told: ["b"],
    });
    const again = new ProcessWatchRecords(db);
    expect(again.load("thread-1")).toEqual({ baseline: ["old"], tracked: ["a"], told: ["b"] });
    again.clear("thread-1");
    expect(again.load("thread-1")).toBeUndefined();
  });
  test("a row that cannot be read is no record, so the watch starts afresh instead of failing", () => {
    const db = openRunDatabase(":memory:");
    const records = new ProcessWatchRecords(db);
    db.query("insert into process_watch (thread_id, state) values (?, ?)").run(
      "thread-1",
      "{not json",
    );
    expect(records.load("thread-1")).toBeUndefined();
  });
  test("a second watch built from the same store does not tell of an end it already told", async () => {
    const store = memoryStore();
    const world = { current: [] as ProcessView[] };
    const first = setup([], { store, world });
    first.run(true);
    first.watch.arm("thread-1");
    await tick();
    first.set([proc("a", "running")]);
    await tick();
    first.set([proc("a", "exited", 0)]);
    await tick();
    expect(idsOf(first.sent)).toEqual(["a"]);
    first.watch.cancelAll();

    const second = setup([], { store, world });
    second.run(true);
    second.watch.arm("thread-1");
    await tick();
    await tick();
    expect(second.sent).toEqual([]);
    second.watch.cancelAll();
  });

  test("one that ends while the runner is down is told of once, by the watch that comes back", async () => {
    const store = memoryStore();
    const world = { current: [] as ProcessView[] };
    const first = setup([], { store, world });
    first.run(true);
    first.watch.arm("thread-1");
    await tick();
    first.set([proc("tests", "running")]);
    await tick();
    expect(first.sent).toEqual([]);
    first.watch.cancelAll();

    first.set([proc("tests", "exited", 0)]);

    const second = setup([], { store, world });
    second.run(true);
    second.watch.arm("thread-1");
    await tick();
    await tick();
    expect(idsOf(second.sent)).toEqual(["tests"]);
    second.watch.cancelAll();

    const third = setup([], { store, world });
    third.run(true);
    third.watch.arm("thread-1");
    await tick();
    await tick();
    expect(third.sent).toEqual([]);
    third.watch.cancelAll();
  });

  test("a watch that ends for good forgets its stored state, so the next run starts from the sandbox", async () => {
    const store = memoryStore();
    const world = { current: [] as ProcessView[] };
    const first = setup([], { store, world });
    first.run(true);
    first.watch.arm("thread-1");
    await tick();
    first.set([proc("a", "running")]);
    await tick();
    first.set([proc("a", "exited", 0)]);
    await tick();
    expect(idsOf(first.sent)).toEqual(["a"]);
    first.run(false);
    await tick();
    first.watch.cancelAll();
    first.set([proc("a", "exited", 0), proc("bystander", "exited", 0)]);

    const second = setup([], { store, world });
    second.run(true);
    second.watch.arm("thread-1");
    await tick();
    await tick();
    expect(second.sent).toEqual([]);
    second.watch.cancelAll();
  });
});
