import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AnyTool } from "@anvia/core";

import { promptOf } from "./attachments";
import { HostSandboxes } from "./host-sandboxes";
import { createMachineCalls } from "./machine-calls";
import { RemoteWorkspaces } from "./remote-workspaces";
import type { RunRecord } from "./types";
import { createRemoteRepo } from "./testing/remote-repo";
import type { MachineCall, ThreadSandbox } from "./types";

const homes: string[] = [];
const sandboxes: HostSandboxes[] = [];

afterEach(async () => {
  await Promise.all(sandboxes.splice(0).map((sandbox) => sandbox.dispose()));
  await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
});

async function machineAndAgent({
  online = (): boolean => true,
  dirs = [] as string[],
}: { online?: () => boolean; dirs?: string[] } = {}) {
  const home = await mkdtemp(join(tmpdir(), "aven-remote-"));
  homes.push(home);
  const sandbox = await HostSandboxes.start({ home, dirs });
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

  test("cancelling a command stops it on the machine", async () => {
    const { agent } = await machineAndAgent();
    const { access } = await createRemoteRepo();
    const box = await agent.acquire({ id: "t1" }, async () => access);
    const tool = box.tools.find((item) => item.name === "exec_command");
    const controller = new AbortController();
    const started = Date.now();
    const pending = tool!.call(
      { command: "echo up > ready; sleep 30", timeoutMs: 20_000 },
      { abortSignal: controller.signal, operationId: "run/cmd-1" },
    );
    const deadline = Date.now() + 8_000;
    let ready = false;
    while (!ready && Date.now() < deadline) {
      const root = agent.paths("t1")?.workspace;
      if (!root) {
        await Bun.sleep(20);
        continue;
      }
      try {
        ready = (await readFile(join(root, "ready"), "utf8")).includes("up");
      } catch {
        await Bun.sleep(20);
      }
    }
    expect(ready).toBe(true);

    controller.abort();
    const ran = await pending;

    expect(ran).toMatchObject({ status: "exited" });
    expect(Date.now() - started).toBeLessThan(12_000);
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
    expect(path).toMatch(/^photo-[0-9a-f]{4}\.png$/);
    expect(await agent.artifacts.read("t1", image)).toEqual({
      mediaType: "image/png",
      data: bytes.toBase64(),
    });

    const box = await agent.acquire({ id: "t1" }, async () => access);
    up = true;
    await box.runtime!.exec({ command: "true" });

    expect(await readFile(join(sandbox.paths("t1").uploads, path), "utf8")).toBe("picture");
    expect(agent.uploads.placedNote("t1")).toBe(
      `An attached file is now on the computer at ${join(sandbox.paths("t1").uploads, path)}.`,
    );
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
    const note = agent.uploads.placedNote("t1");
    expect(note).toContain("Attached files are now on the computer");
    for (const name of names) expect(note).toContain(join(sandbox.paths("t1").uploads, name));
  });

  test("a waited file is not named for the uploads folder last learnt, and is named for the machine's folder once the file is written", async () => {
    let up = true;
    const { sandbox, agent } = await machineAndAgent({ online: () => up });
    const { access } = await createRemoteRepo();
    const box = await agent.acquire({ id: "t1" }, async () => access);
    await box.start?.();
    up = false;
    const bytes = new TextEncoder().encode("picture");
    const name = await agent.uploads.save("t1", "photo.png", bytes);

    const waiting = await promptOf(attachmentRecord(name), agent);
    const waitingText = JSON.stringify(waiting);
    expect(name).toMatch(/^photo-[0-9a-f]{4}\.png$/);
    expect(waitingText).toContain("waiting to be written");
    expect(waitingText).toContain(name);
    expect(waitingText).not.toContain(`${sandbox.paths("t1").uploads}/${name}`);
    expect(waitingText).not.toContain(`/uploads/${name}`);

    up = true;
    const placed = await promptOf(attachmentRecord(name), agent);
    const full = join(sandbox.paths("t1").uploads, name);
    expect(JSON.stringify(placed)).toContain(full);
    expect(await readFile(full, "utf8")).toBe("picture");
    expect(agent.uploads.placedNote("t1")).toBeUndefined();
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

const FOLDER_NOT_A_CLONE =
  "The thread's project is a folder on a computer, not a repository to clone";

describe("a project that is a folder on the machine", () => {
  const refusedClone = () => Promise.reject(new Error(FOLDER_NOT_A_CLONE));

  test("runs git status, pull, branch and remote in a checkout, and does not ask to clone a repository", async () => {
    const { dir } = await createRemoteRepo();
    homes.push(dir);
    const { agent } = await machineAndAgent({ dirs: [dir] });
    let asked = false;
    const box = await agent.acquire(
      { id: "t1" },
      async () => {
        asked = true;
        return refusedClone();
      },
      { folder: async () => dir },
    );

    const status = await call(box.tools, "exec_command", { command: "git status -sb" });
    const remote = await call(box.tools, "exec_command", { command: "git remote -v" });
    const branch = await call(box.tools, "exec_command", { command: "git branch -vv" });
    const pull = await call(box.tools, "exec_command", { command: "git pull" });

    expect(asked).toBe(false);
    expect(status.exitCode).toBe(0);
    expect(String(status.stdout)).toContain("aven/t1");
    expect(remote.exitCode).toBe(0);
    expect(String(remote.stdout)).toContain(await realpath(dir));
    expect(branch.exitCode).toBe(0);
    expect(String(branch.stdout)).toContain("aven/t1");
    expect(pull.exitCode).toBe(0);
    expect(String(pull.stdout)).toContain("Already up to date");
  });

  test("runs git in a folder that is not a repository, and git itself says so", async () => {
    const dir = await mkdtemp(join(tmpdir(), "aven-plain-"));
    homes.push(dir);
    await writeFile(join(dir, "notes.txt"), "mine");
    const { agent } = await machineAndAgent({ dirs: [dir] });
    let asked = false;
    const box = await agent.acquire(
      { id: "t1" },
      async () => {
        asked = true;
        return refusedClone();
      },
      { folder: async () => dir },
    );

    const status = await call(box.tools, "exec_command", { command: "git status" });
    const remote = await call(box.tools, "exec_command", { command: "git remote -v" });

    expect(asked).toBe(false);
    expect(status.exitCode).not.toBe(0);
    expect(`${status.stderr}`).toMatch(/not a git repository/i);
    expect(remote.exitCode).not.toBe(0);
    expect(`${remote.stderr}`).toMatch(/not a git repository/i);
    expect(`${status.stderr}${remote.stderr}`).not.toContain("repository to clone");
  });

  test("still refuses to prepare a repository that has no folder when clone access is refused", async () => {
    const { agent } = await machineAndAgent();
    const box = await agent.acquire({ id: "t1" }, refusedClone);

    await expect(call(box.tools, "exec_command", { command: "git status" })).rejects.toThrow(
      "not a repository to clone",
    );
  });
});

function attachmentRecord(path: string): RunRecord {
  return {
    runId: "run-1",
    thread: { id: "t1", organizationId: "org" },
    kind: "start",
    prompt: "see this",
    attachments: [{ name: "photo.png", mediaType: "image/png", size: 7, path }],
    agentId: "agent-1",
    turn: 0,
    phase: "chat",
  };
}

async function until(check: () => Promise<boolean>) {
  const deadline = Date.now() + 3000;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error("timed out");
    await Bun.sleep(20);
  }
}
