import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AnyTool } from "@anvia/core";

import { HostSandboxes } from "./host-sandboxes";
import { createMachineCalls } from "./machine-calls";
import { RemoteWorkspaces } from "./remote-workspaces";
import { createRemoteRepo } from "./testing/remote-repo";
import type { MachineCall, ThreadSandbox } from "./types";

const homes: string[] = [];
const sandboxes: HostSandboxes[] = [];

afterEach(async () => {
  await Promise.all(sandboxes.splice(0).map((sandbox) => sandbox.dispose()));
  await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
});

async function machineAndAgent({ online = (): boolean => true }: { online?: () => boolean } = {}) {
  const home = await mkdtemp(join(tmpdir(), "aven-remote-"));
  homes.push(home);
  const sandbox = await HostSandboxes.start({ home });
  sandboxes.push(sandbox);
  const boxes = new Map<string, ThreadSandbox>();
  const answer = createMachineCalls({
    sandbox,
    boxes,
    idle: {
      starting: async () => undefined,
      schedule: () => undefined,
      releaseNow: async () => true,
    },
  });
  const ops: string[] = [];
  const callFor =
    (threadId: string): MachineCall =>
    async (op, args) => {
      ops.push(op);
      if (!online()) throw new Error("The computer is offline");
      return answer({ threadId, op, args: JSON.parse(JSON.stringify(args ?? {})) });
    };
  return { sandbox, ops, agent: new RemoteWorkspaces(callFor) };
}

const call = (tools: readonly AnyTool[], name: string, input: unknown) =>
  tools.find((tool) => tool.name === name)!.call(input as never, undefined as never) as Promise<
    Record<string, unknown>
  >;

describe("an agent whose computer is another machine", () => {
  test("knows the machine's paths before it prepares anything, and prepares the workspace on first use", async () => {
    const { sandbox, ops, agent } = await machineAndAgent();
    const { access } = await createRemoteRepo();

    const box = await agent.acquire({ id: "t1" }, async () => access);
    expect(agent.paths("t1")).toEqual(sandbox.paths("t1"));
    expect(ops).toEqual(["paths"]);

    const ran = await call(box.tools, "exec_command", { command: "git branch --show-current" });
    expect(String(ran.stdout)).toBe("aven/t1\n");
    expect(ops.slice(0, 3)).toEqual(["paths", "prepare", "exec"]);
    expect(await agent.workspace("t1")).toBe(sandbox.paths("t1").workspace);
  });

  test("edits a file on the machine with the agent's own tools", async () => {
    const { sandbox, agent } = await machineAndAgent();
    const { access } = await createRemoteRepo();
    const box = await agent.acquire({ id: "t1" }, async () => access);

    await call(box.tools, "write_file", { path: "notes.md", content: "one\n" });
    await call(box.tools, "edit", { path: "notes.md", oldString: "one", newString: "two" });

    expect(await readFile(join(sandbox.paths("t1").workspace, "notes.md"), "utf8")).toBe("two\n");
  });

  test("runs commands with the project's variables, which are not kept on the machine's disk", async () => {
    const { agent } = await machineAndAgent();
    const { access } = await createRemoteRepo();
    const box = await agent.acquire({ id: "t1" }, async () => access);
    agent.setProjectEnv("t1", [{ name: "TOKEN", value: "s3cret", secret: true }]);

    const ran = await call(box.tools, "exec_command", { command: "echo $TOKEN" });

    expect(String(ran.stdout)).toBe("s3cret\n");
  });

  test("a machine that is offline fails the tool, and is tried again on the next one", async () => {
    let up = false;
    const { agent } = await machineAndAgent({ online: () => up });
    const { access } = await createRemoteRepo();
    const box = await agent.acquire({ id: "t1" }, async () => access);
    expect(agent.paths("t1")).toBeUndefined();

    await expect(box.runtime!.exec({ command: "true" })).rejects.toThrow("The computer is offline");
    up = true;
    const ran = await box.runtime!.exec({ command: "cat README.md" });

    expect(new TextDecoder().decode(ran.stdout)).toBe("# remote\n");
  });

  test("sends a skill's archive only when the machine does not have it yet", async () => {
    const { agent } = await machineAndAgent();
    const { access } = await createRemoteRepo();
    const box = await agent.acquire({ id: "t1" }, async () => access);
    await box.start?.();
    const digest = "1".repeat(64);
    const archive = await new Bun.Archive(
      { "SKILL.md": "---\nname: notes\ndescription: Notes.\n---\nSteps." },
      { compress: "gzip" },
    ).bytes();
    const fetched: string[] = [];
    const fetch = async (wanted: string) => (fetched.push(wanted), archive);
    const skills = [{ name: "notes", description: "Notes.", digest }];

    const first = await agent.skills.install("t1", skills, fetch);
    const again = await agent.skills.install("t1", skills, fetch);

    expect(first.map((skill) => skill.name)).toEqual(["notes"]);
    expect(again.map((skill) => skill.name)).toEqual(["notes"]);
    expect(fetched).toEqual([digest]);
  });

  test("a file attached while the machine is offline waits, and is written under the name the agent was given once it is reached", async () => {
    let up = false;
    const { sandbox, agent } = await machineAndAgent({ online: () => up });
    const { access } = await createRemoteRepo();
    const image = `${crypto.randomUUID()}.png`;
    const bytes = new TextEncoder().encode("picture");

    const path = await agent.uploads.save("t1", "photo.png", bytes);
    await agent.artifacts.keep("t1", image, bytes);
    expect(path).toMatch(/^\/uploads\/photo-[0-9a-f]{4}\.png$/);
    expect(await agent.artifacts.read("t1", image)).toEqual({
      mediaType: "image/png",
      data: bytes.toBase64(),
    });

    const box = await agent.acquire({ id: "t1" }, async () => access);
    up = true;
    await box.runtime!.exec({ command: "true" });

    const name = path.slice(path.lastIndexOf("/") + 1);
    expect(await readFile(join(sandbox.paths("t1").uploads, name), "utf8")).toBe("picture");
    expect(await sandbox.artifacts.read("t1", image)).toEqual({
      mediaType: "image/png",
      data: bytes.toBase64(),
    });
  });

  test("a fork's folder is made from its parent's on the machine, and its changes are taken there", async () => {
    const { sandbox, agent } = await machineAndAgent();
    const { access } = await createRemoteRepo();
    const fork = "abcdef12-0000-4000-8000-000000000000";
    const parent = await agent.acquire({ id: "t1" }, async () => access);
    await parent.start?.();
    const forked = await agent.acquire({ id: fork, forkOf: "t1" }, async () => access);
    await call(forked.tools, "write_file", { path: "b.txt", content: "new\n" });

    const taken = await agent.takeFork("t1", fork);

    if (taken.empty) throw new Error("expected changes");
    expect(taken.files).toEqual(["b.txt"]);
    expect(taken.patchPath).toBe(`${sandbox.paths("t1").workspace}/.git/aven-forks/abcdef12.patch`);
    expect(
      await readFile(join(sandbox.paths("t1").workspace, ".git/aven-forks/abcdef12.patch"), "utf8"),
    ).toContain("+new");
  });

  test("a file kept while the machine was offline is written once the machine answers any call, even after the folder was prepared", async () => {
    let up = true;
    const { sandbox, agent } = await machineAndAgent({ online: () => up });
    const { access } = await createRemoteRepo();
    const box = await agent.acquire({ id: "t1" }, async () => access);
    await box.start?.();
    up = false;
    const path = await agent.uploads.save("t1", "late.txt", new TextEncoder().encode("late"));
    up = true;

    await box.runtime!.exec({ command: "true" });
    const name = path.slice(path.lastIndexOf("/") + 1);
    await until(async () =>
      readFile(join(sandbox.paths("t1").uploads, name), "utf8").then(
        (text) => text === "late",
        () => false,
      ),
    );
  });

  test("several files kept while the machine was offline are all written, though the folder's preparation and another call both deliver them", async () => {
    let up = false;
    const { sandbox, agent } = await machineAndAgent({ online: () => up });
    const { access } = await createRemoteRepo();
    const names = await Promise.all(
      ["a.txt", "b.txt", "c.txt"].map(async (name) =>
        (await agent.uploads.save("t1", name, new TextEncoder().encode(name))).split("/").pop()!,
      ),
    );
    const box = await agent.acquire({ id: "t1" }, async () => access);
    up = true;

    await Promise.all([box.start?.(), box.runtime!.exec({ command: "true" })]);

    await until(async () =>
      (
        await Promise.all(
          names.map((name) => Bun.file(join(sandbox.paths("t1").uploads, name)).exists()),
        )
      ).every(Boolean),
    );
  });

  test("forgets what it kept for a thread when the thread is released", async () => {
    const { agent } = await machineAndAgent();
    const image = `${crypto.randomUUID()}.png`;
    await agent.artifacts.keep("t1", image, new TextEncoder().encode("picture"));
    expect(await agent.artifacts.read("t1", image)).not.toBeNull();

    await agent.release("t1");

    expect(await agent.artifacts.read("t1", image)).toBeNull();
  });
});

async function until(check: () => Promise<boolean>) {
  const deadline = Date.now() + 3000;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error("timed out");
    await Bun.sleep(20);
  }
}
