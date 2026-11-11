import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { HostSandboxes } from "./host-sandboxes";
import { createMachineCalls } from "./machine-calls";
import { createRemoteRepo } from "./testing/remote-repo";
import type { ThreadSandbox } from "./types";

const homes: string[] = [];
const sandboxes: HostSandboxes[] = [];

afterEach(async () => {
  await Promise.all(sandboxes.splice(0).map((sandbox) => sandbox.dispose()));
  await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
});

async function machine() {
  const home = await mkdtemp(join(tmpdir(), "aven-machine-"));
  homes.push(home);
  const sandbox = await HostSandboxes.start({ home });
  sandboxes.push(sandbox);
  const boxes = new Map<string, ThreadSandbox>();
  const released: string[] = [];
  const call = createMachineCalls({
    sandbox,
    boxes,
    idle: {
      starting: async () => undefined,
      schedule: () => undefined,
      releaseNow: async (threadId) => {
        released.push(threadId);
        boxes.delete(threadId);
        await sandbox.release(threadId);
        return true;
      },
    },
  });
  return { sandbox, boxes, released, call };
}

const text = (data: unknown) => new TextDecoder().decode(Uint8Array.fromBase64(String(data)));

describe("a machine that lends its computer to an agent elsewhere", () => {
  test("prepares a thread's workspace and runs its commands there, with the project's variables", async () => {
    const { call } = await machine();
    const { access } = await createRemoteRepo();

    const prepared = (await call({
      threadId: "t1",
      op: "prepare",
      args: { thread: {}, repo: access },
    })) as { paths: { workspace: string } };
    await call({
      threadId: "t1",
      op: "setProjectEnv",
      args: { env: [{ name: "GREETING", value: "hello" }] },
    });
    const ran = (await call({
      threadId: "t1",
      op: "exec",
      args: { command: "pwd; git branch --show-current; echo $GREETING" },
    })) as { status: string; stdout: string };

    expect(ran.status).toBe("exited");
    expect(text(ran.stdout)).toBe(`${prepared.paths.workspace}\naven/t1\nhello\n`);
  });

  test("writes and reads a file's bytes as they are", async () => {
    const { call } = await machine();
    const { access } = await createRemoteRepo();
    await call({ threadId: "t1", op: "prepare", args: { thread: {}, repo: access } });
    const bytes = new Uint8Array([0, 1, 2, 250, 255]);

    await call({
      threadId: "t1",
      op: "writeFile",
      args: { path: "data.bin", data: bytes.toBase64() },
    });
    const read = (await call({ threadId: "t1", op: "readFile", args: { path: "data.bin" } })) as {
      data: string;
    };

    expect(Uint8Array.fromBase64(read.data)).toEqual(bytes);
  });

  test("refuses a thread it has not prepared, and takes up one it has after its computer was freed", async () => {
    const { call, boxes } = await machine();
    const { access } = await createRemoteRepo();

    await expect(call({ threadId: "t1", op: "exec", args: { command: "true" } })).rejects.toThrow(
      "not prepared",
    );

    await call({ threadId: "t1", op: "prepare", args: { thread: {}, repo: access } });
    await call({ threadId: "t1", op: "release" });
    expect(boxes.has("t1")).toBe(false);
    const ran = (await call({
      threadId: "t1",
      op: "exec",
      args: { command: "cat README.md" },
    })) as { stdout: string };

    expect(text(ran.stdout)).toBe("# remote\n");
  });

  test("a process the agent starts is one the platform can list and stop on this runner", async () => {
    const { call, boxes } = await machine();
    const { access } = await createRemoteRepo();
    await call({ threadId: "t1", op: "prepare", args: { thread: {}, repo: access } });

    const started = (await call({
      threadId: "t1",
      op: "startProcess",
      args: { command: "sleep 30" },
    })) as { id: string };
    const listed = await boxes.get("t1")!.processes.list();

    expect(listed.map((process) => process.id)).toContain(started.id);
    await boxes.get("t1")!.processes.stop(started.id);
  });
});
