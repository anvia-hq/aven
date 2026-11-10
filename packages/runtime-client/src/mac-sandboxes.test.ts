import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { MacSandboxes } from "./mac-sandboxes";
import { fakeTart } from "./testing/fake-tart";
import type { ThreadSandbox } from "./types";

let root: string;
let tart: Awaited<ReturnType<typeof fakeTart>>;
const saved = process.env.FAKE_TART_STATE;
const open: MacSandboxes[] = [];

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "aven-mac-sandboxes-"));
  tart = await fakeTart(root);
  process.env.FAKE_TART_STATE = tart.state;
});

afterEach(async () => {
  for (const sandboxes of open.splice(0)) await sandboxes.dispose();
  if (saved === undefined) delete process.env.FAKE_TART_STATE;
  else process.env.FAKE_TART_STATE = saved;
  await rm(root, { recursive: true, force: true });
});

const started = async (overrides: { base?: string; bin?: string } = {}) => {
  const sandboxes = await MacSandboxes.start({
    base: overrides.base ?? "base",
    bin: overrides.bin ?? tart.bin,
    home: join(root, "home"),
    connectTimeoutMs: 5000,
  });
  open.push(sandboxes);
  return sandboxes;
};

const calls = () => readFile(join(tart.state, "calls.log"), "utf8");

async function run(box: ThreadSandbox, name: string, input: Record<string, unknown>) {
  const tool = box.tools.find((candidate) => candidate.name === name)!;
  return tool.call(input, undefined as never) as Promise<Record<string, unknown>>;
}

describe("starting a Mac runner", () => {
  test("prepares the image once, giving the guest links to the folders the agent knows", async () => {
    await started();
    const conf = await readFile(join(tart.state, "synthetic.conf"), "utf8");
    expect(conf).toContain("workspace\tVolumes/My Shared Files/workspace");
    expect(conf).toContain("uploads\tVolumes/My Shared Files/uploads");

    await started();
    expect((await calls()).match(/^clone base aven-mac-ready-base$/gm)).toHaveLength(1);
  });

  test("says what to do when Tart is missing or the image is not on the Mac", async () => {
    await expect(started({ bin: join(root, "nowhere") })).rejects.toThrow("Tart does not run");
    await expect(started({ base: "missing" })).rejects.toThrow("tart pull missing");
  });
});

describe("a thread's macOS sandbox", () => {
  test("runs commands in the VM inside the thread's workspace, and files are the host's files", async () => {
    const sandboxes = await started();
    const box = await sandboxes.acquire({ id: "t1" });
    expect(sandboxes.computerState("t1")).toBe("asleep");

    await run(box, "write_file", { path: "/workspace/App/main.swift", content: "print(1)\n" });
    const root1 = (await sandboxes.workspace("t1")) ?? join(root, "home", "workspaces", "t1");
    expect(await readFile(join(root1, "App", "main.swift"), "utf8")).toBe("print(1)\n");

    const out = await run(box, "exec_command", { command: "pwd && cat App/main.swift" });
    expect(JSON.stringify(out)).toContain("print(1)");
    expect(sandboxes.computerState("t1")).toBe("awake");
    expect(await readFile(join(tart.state, "calls.log"), "utf8")).toContain("exec -i aven-mac-t1");
  });

  test("a project variable reaches the command but never the VM tool's arguments", async () => {
    const sandboxes = await started();
    const box = await sandboxes.acquire({ id: "t1" });
    sandboxes.setProjectEnv("t1", [{ name: "API_KEY", value: "sekret-value-123", secret: true }]);

    const out = await run(box, "exec_command", { command: 'echo "key=$API_KEY"' });
    expect(JSON.stringify(out)).toContain("key=sekret-value-123");
    expect(await calls()).not.toContain("sekret-value-123");
  });

  test("a second thread is refused while the first has the VM, and gets it when the first lets go", async () => {
    const sandboxes = await started();
    const first = await sandboxes.acquire({ id: "t1" });
    const second = await sandboxes.acquire({ id: "t2" });
    await run(first, "exec_command", { command: "true" });

    await expect(run(second, "exec_command", { command: "true" })).rejects.toThrow(
      "runs one macOS sandbox at a time",
    );
    expect(sandboxes.running()).toBe(1);

    await sandboxes.release("t1");
    expect(sandboxes.computerState("t1")).toBe("asleep");
    expect(sandboxes.running()).toBe(0);
    await run(second, "exec_command", { command: "true" });
    expect(sandboxes.computerState("t2")).toBe("awake");
  });

  test("keeps the VM's disk when the thread sleeps and deletes it when the thread is put away", async () => {
    const sandboxes = await started();
    const box = await sandboxes.acquire({ id: "t1" });
    await run(box, "exec_command", { command: "true" });
    await sandboxes.release("t1");
    expect(await Bun.file(join(tart.state, "vms", "aven-mac-t1", "dirs")).exists()).toBe(true);

    await sandboxes.putAway("t1");
    expect(await Bun.file(join(tart.state, "vms", "aven-mac-t1", "dirs")).exists()).toBe(false);
  });

  test("has no desktop to show", async () => {
    const sandboxes = await started();
    await sandboxes.acquire({ id: "t1" });
    expect(sandboxes.desktop()).toBeUndefined();
  });
});

void writeFile;
