import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DirectorySandbox } from "./directory-sandbox";
import { ProcessEndWatch } from "../processes/process-end-watch";
import { threadProcesses } from "../thread-processes";
import type { RuntimeToControlPlane } from "@aven/protocol/types";

const folders: string[] = [];
const sandboxes: DirectorySandbox[] = [];

afterEach(async () => {
  await Promise.all(sandboxes.splice(0).map((sandbox) => sandbox.dispose()));
  await Promise.all(folders.splice(0).map((folder) => rm(folder, { recursive: true })));
});

async function open() {
  const folder = await mkdtemp(join(tmpdir(), "aven-processes-"));
  folders.push(folder);
  const sandbox = new DirectorySandbox("thread-1", folder);
  sandboxes.push(sandbox);
  return threadProcesses(sandbox as never, () => true);
}

test("a process in a later sandbox is not mistaken for one an earlier sandbox left running", async () => {
  const sent: RuntimeToControlPlane[] = [];
  let processes = await open();
  let running = true;
  const watch = new ProcessEndWatch({
    box: () => ({ processes }) as never,
    send: (message) => sent.push(message) > 0,
    hasRun: () => running,
    stopped: () => false,
    pollMs: 20,
  });
  await processes.start("sleep 30");
  await watch.arm("thread-1");
  processes = await open();
  await processes.start("echo done");
  running = false;
  watch.settle("thread-1");

  for (let i = 0; i < 100 && sent.length === 0; i++) await Bun.sleep(20);

  watch.cancelAll();
  expect(sent.map((message) => message.type)).toEqual(["process.ended"]);
});

test("the output of a process that is not UTF-8 is read as text a strict decoder accepts", async () => {
  const folder = await mkdtemp(join(tmpdir(), "aven-logs-"));
  folders.push(folder);
  const sandbox = new DirectorySandbox("thread-1", folder);
  sandboxes.push(sandbox);
  const { id } = await sandbox.startProcess({
    command: "printf",
    args: ["ok \\377\\376 \\342\\234\\223 done"],
  });

  for (let i = 0; i < 100; i++) {
    const [info] = await sandbox.listProcesses();

    if (info?.status !== "running") break;

    await Bun.sleep(20);
  }

  const strict = new TextDecoder("utf-8", { fatal: true });
  const whole = await sandbox.readProcessLogs({ processId: id });
  const tail = await sandbox.readProcessLogs({ processId: id, tailBytes: 6 });

  expect(strict.decode(whole.stdout)).toBe("ok �� ✓ done");
  expect(strict.decode(tail.stdout)).toBe(" done");
});

test("process stdout and stderr buffers stay capped at 1 MiB and preserve the tail", async () => {
  const folder = await mkdtemp(join(tmpdir(), "aven-cap-"));
  folders.push(folder);
  const sandbox = new DirectorySandbox("thread-1", folder);
  sandboxes.push(sandbox);
  const { id } = await sandbox.startProcess({
    command: "bun",
    args: [
      "-e",
      'process.stdout.write("A".repeat(1200000) + "TAIL_END"); process.stderr.write("E".repeat(1200000) + "ERR_END");',
    ],
  });

  for (let i = 0; i < 200; i++) {
    const [info] = await sandbox.listProcesses();

    if (info?.status !== "running") break;

    await Bun.sleep(20);
  }

  const logs = await sandbox.readProcessLogs({ processId: id });
  expect(logs.stdoutTruncated).toBe(true);
  expect(logs.stderrTruncated).toBe(true);
  expect(logs.stdout.byteLength).toBeLessThanOrEqual(1024 * 1024);
  expect(logs.stderr.byteLength).toBeLessThanOrEqual(1024 * 1024);
  expect(new TextDecoder().decode(logs.stdout).endsWith("TAIL_END")).toBe(true);
  expect(new TextDecoder().decode(logs.stderr).endsWith("ERR_END")).toBe(true);
});

test("prunes oldest exited processes beyond the cap while keeping running processes", async () => {
  const folder = await mkdtemp(join(tmpdir(), "aven-prune-"));
  folders.push(folder);
  const sandbox = new DirectorySandbox("thread-1", folder);
  sandboxes.push(sandbox);
  const sleeper = await sandbox.startProcess({ command: "sleep", args: ["30"] });
  const exitedIds: string[] = [];

  for (let i = 0; i < 55; i++) {
    const info = await sandbox.startProcess({ command: "true", args: [] });
    exitedIds.push(info.id);
  }

  for (let i = 0; i < 200; i++) {
    const all = await sandbox.listProcesses();
    const stillRunning = all.filter((proc) => proc.status === "running");

    if (stillRunning.length === 1 && stillRunning[0]?.id === sleeper.id) break;

    await Bun.sleep(20);
  }

  const remaining = await sandbox.listProcesses();
  const exited = remaining.filter((proc) => proc.status !== "running");
  expect(remaining.some((proc) => proc.id === sleeper.id && proc.status === "running")).toBe(true);
  expect(exited.length).toBeLessThanOrEqual(50);
  expect(remaining.some((proc) => proc.id === exitedIds[0])).toBe(false);
  expect(remaining.some((proc) => proc.id === exitedIds.at(-1))).toBe(true);
});

test("waitForPort resolves once a local TCP listener accepts connections", async () => {
  const folder = await mkdtemp(join(tmpdir(), "aven-port-"));
  folders.push(folder);
  const sandbox = new DirectorySandbox("thread-1", folder);
  sandboxes.push(sandbox);

  const server = Bun.listen({
    hostname: "127.0.0.1",
    port: 0,
    socket: {
      data() {},
    },
  });

  try {
    const status = await sandbox.waitForPort({
      containerPort: server.port,
      timeoutMs: 2000,
      intervalMs: 20,
    });
    expect(status).toEqual({
      containerPort: server.port,
      protocol: "tcp",
      host: "127.0.0.1",
      hostPort: server.port,
    });
  } finally {
    server.stop(true);
  }
});

test("waitForPort times out when nothing is listening and aborts on signal", async () => {
  const folder = await mkdtemp(join(tmpdir(), "aven-port-timeout-"));
  folders.push(folder);
  const sandbox = new DirectorySandbox("thread-1", folder);
  sandboxes.push(sandbox);

  const probe = Bun.listen({
    hostname: "127.0.0.1",
    port: 0,
    socket: {
      data() {},
    },
  });
  const unusedPort = probe.port;
  probe.stop(true);

  await expect(
    sandbox.waitForPort({ containerPort: unusedPort, timeoutMs: 80, intervalMs: 20 }),
  ).rejects.toThrow(`Timed out waiting for port ${unusedPort}`);

  const controller = new AbortController();
  setTimeout(() => controller.abort(new Error("cancelled")), 30);

  await expect(
    sandbox.waitForPort({
      containerPort: unusedPort,
      timeoutMs: 2000,
      intervalMs: 20,
      abortSignal: controller.signal,
    }),
  ).rejects.toThrow("cancelled");
});
