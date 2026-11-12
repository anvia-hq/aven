import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createMachineCalls } from "./machine-calls";
import { createMachineProcessWatch } from "./machine-process-watch";
import { ProcessEndWatch } from "./process-end-watch";
import { createRunnerCalls } from "./runner-calls";
import { HostSandboxes } from "./host-sandboxes";
import { createRemoteRepo } from "./testing/remote-repo";
import type { ProcessView, RuntimeToControlPlane } from "@aven/protocol/types";
import type { ThreadSandbox, ThreadWorkspaces } from "./types";

const homes: string[] = [];
const sandboxes: HostSandboxes[] = [];
const watches: ProcessEndWatch[] = [];

afterEach(async () => {
  for (const watch of watches.splice(0)) watch.cancelAll();
  await Promise.all(sandboxes.splice(0).map((sandbox) => sandbox.dispose()));
  await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
});

const until = async (check: () => boolean) => {
  for (let i = 0; i < 100 && !check(); i++) await Bun.sleep(20);
  expect(check()).toBe(true);
};

function watching(initial: ProcessView[] = []) {
  const world = initial.map((process) => ({ ...process }));
  const sent: RuntimeToControlPlane[] = [];
  const guests = new Set<string>();
  const box = {
    runtime: {
      async startProcess(options: { command: string; args?: string[] }) {
        const script = options.args?.[0] === "-c" ? options.args[1] : undefined;
        const process: ProcessView = {
          id: `p${world.length + 1}`,
          command: script ?? options.command,
          status: "running",
          startedAt: new Date().toISOString(),
        };
        world.push(process);
        return process;
      },
      async stopProcess({ processId }: { processId: string }) {
        const found = world.find((process) => process.id === processId);
        if (!found) throw new Error("No such process");
        found.status = "stopped";
        return found;
      },
    },
    processes: {
      list: async () => world.map((process) => ({ ...process })),
      logs: async () => ({ stdout: "out", stderr: "err", truncated: false }),
      stop: async (processId: string) => {
        const found = world.find((process) => process.id === processId);
        if (!found) throw new Error("No such process");
        found.status = "stopped";
        return world.map((process) => ({ ...process }));
      },
      start: async () => {
        throw new Error("The agent starts a process through the machine");
      },
    },
    hasRunningProcesses: async () => world.some((process) => process.status === "running"),
    tools: [],
  } as unknown as ThreadSandbox;
  const boxes = new Map<string, ThreadSandbox>([["t1", box]]);
  const sandbox = {
    acquire: async () => box,
    workspace: async () => "/work",
    paths: () => ({ workspace: "/work", uploads: "/uploads", skills: "/skills" }),
    release: async () => undefined,
    dispose: async () => undefined,
  } as unknown as ThreadWorkspaces;
  const watch = new ProcessEndWatch({
    box: (threadId) => boxes.get(threadId),
    send: (message) => (sent.push(message), true),
    hasRun: (threadId) => guests.has(threadId),
    stopped: () => false,
    pollMs: 5,
  });
  watches.push(watch);
  const machineProcesses = createMachineProcessWatch(watch, guests);
  const call = createMachineCalls({
    sandbox,
    boxes,
    idle: {
      starting: async () => undefined,
      schedule: () => undefined,
      releaseNow: async () => true,
    },
    machineProcesses,
  });
  const runner = createRunnerCalls({
    sandbox,
    boxes,
    idle: {
      starting: async () => undefined,
      schedule: () => undefined,
      releaseNow: async () => true,
    },
    processEnds: watch,
    machineProcesses,
    steer: async () => ({ status: "closed" }),
  });
  return {
    world,
    sent,
    guests,
    call,
    runner,
    prepare: () => call({ threadId: "t1", op: "prepare", args: { thread: {} } }),
  };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 30));

const proc = (id: string, status: ProcessView["status"]): ProcessView => ({
  id,
  command: `cmd ${id}`,
  status,
  exitCode: status === "running" ? undefined : 0,
  startedAt: new Date(0).toISOString(),
  endedAt: status === "running" ? undefined : new Date(90_000).toISOString(),
});

describe("a process the control-plane agent starts on a machine", () => {
  test("is told of when it ends, and one that was already there is not", async () => {
    const t = watching([proc("old", "running")]);
    await t.prepare();
    await tick();
    const old = t.world[0];
    if (old) {
      old.status = "exited";
      old.exitCode = 0;
      old.endedAt = new Date(Date.parse(old.startedAt) + 90_000).toISOString();
    }
    const started = (await t.call({
      threadId: "t1",
      op: "startProcess",
      args: { command: "sh", args: ["-c", "bun test"] },
    })) as { id: string };
    const fresh = t.world.find((process) => process.id === started.id);
    if (fresh) {
      fresh.status = "exited";
      fresh.exitCode = 0;
      fresh.endedAt = new Date(Date.parse(fresh.startedAt) + 90_000).toISOString();
    }
    await tick();
    await tick();

    expect(t.sent).toEqual([
      {
        type: "process.ended",
        threadId: "t1",
        processId: started.id,
        command: "bun test",
        status: "exited",
        exitCode: 0,
        ranSeconds: 90,
        stdout: "out",
        stderr: "err",
      },
    ]);
  });

  test("stays watched through the run, so a process started after a quiet stretch is still told of", async () => {
    const t = watching();
    await t.prepare();
    await tick();
    await tick();
    expect(t.guests.has("t1")).toBe(true);
    const started = (await t.call({
      threadId: "t1",
      op: "startProcess",
      args: { command: "sleep", args: ["30"] },
    })) as { id: string };
    const fresh = t.world.find((process) => process.id === started.id);
    if (fresh) Object.assign(fresh, { ...proc(started.id, "exited"), command: "sleep 30" });
    await tick();
    expect(
      t.sent.map((message) => (message.type === "process.ended" ? message.processId : "")),
    ).toEqual([started.id]);
  });

  test("a question suspends it, and the next run hears of a process that ended meanwhile", async () => {
    const t = watching();
    await t.prepare();
    const started = (await t.call({
      threadId: "t1",
      op: "startProcess",
      args: { command: "bun", args: ["test"] },
    })) as { id: string };
    await tick();
    await t.runner("process.watch", { threadId: "t1", phase: "suspend" });
    const fresh = t.world.find((process) => process.id === started.id);
    if (fresh) Object.assign(fresh, proc(started.id, "exited"));
    await tick();
    expect(t.sent).toEqual([]);
    expect(t.guests.has("t1")).toBe(false);

    await t.runner("process.watch", { threadId: "t1", phase: "arm" });
    await tick();
    expect(
      t.sent.map((message) => (message.type === "process.ended" ? message.processId : "")),
    ).toEqual([started.id]);
  });

  test("settles when the run ends with a response, and then stops watching", async () => {
    const t = watching();
    await t.prepare();
    const started = (await t.call({
      threadId: "t1",
      op: "startProcess",
      args: { command: "true" },
    })) as { id: string };
    const fresh = t.world.find((process) => process.id === started.id);
    if (fresh) Object.assign(fresh, proc(started.id, "exited"));
    await t.runner("process.watch", { threadId: "t1", phase: "settle" });
    await tick();
    expect(t.sent).toHaveLength(1);
    expect(t.guests.has("t1")).toBe(false);

    t.world.push(proc("later", "exited"));
    await tick();
    expect(t.sent).toHaveLength(1);
  });

  test("a process the person stops is not told of", async () => {
    const t = watching();
    await t.prepare();
    const started = (await t.call({
      threadId: "t1",
      op: "startProcess",
      args: { command: "dev" },
    })) as { id: string };
    await tick();
    await t.runner("processes.stop", { threadId: "t1", processId: started.id });
    await tick();
    expect(t.sent).toEqual([]);
  });

  test("refuses a watch with no thread or no phase", async () => {
    const t = watching();
    expect(() => t.runner("process.watch", { phase: "settle" })).toThrow("Invalid parameters");
    expect(() => t.runner("process.watch", { threadId: "t1", phase: "nap" })).toThrow(
      "Invalid parameters",
    );
  });
});

describe("a real process the agent starts on the machine", () => {
  test("wakes the thread when it ends, with the end of what it printed", async () => {
    const home = await mkdtemp(join(tmpdir(), "aven-machine-watch-"));
    homes.push(home);
    const sandbox = await HostSandboxes.start({ home });
    sandboxes.push(sandbox);
    const boxes = new Map<string, ThreadSandbox>();
    const sent: RuntimeToControlPlane[] = [];
    const guests = new Set<string>();
    const watch = new ProcessEndWatch({
      box: (threadId) => boxes.get(threadId),
      send: (message) => (sent.push(message), true),
      hasRun: (threadId) => guests.has(threadId),
      stopped: () => false,
      pollMs: 15,
    });
    watches.push(watch);
    const call = createMachineCalls({
      sandbox,
      boxes,
      idle: {
        starting: async () => undefined,
        schedule: () => undefined,
        releaseNow: async () => true,
      },
      machineProcesses: createMachineProcessWatch(watch, guests),
    });
    const { access } = await createRemoteRepo();
    await call({ threadId: "t1", op: "prepare", args: { thread: {}, repo: access } });

    await call({
      threadId: "t1",
      op: "startProcess",
      args: { command: "sh", args: ["-c", "echo hello"] },
    });

    await until(() => sent.some((message) => message.type === "process.ended"));
    expect(sent.find((message) => message.type === "process.ended")).toMatchObject({
      threadId: "t1",
      command: "echo hello",
      status: "exited",
      exitCode: 0,
      stdout: "hello\n",
    });
  });
});
