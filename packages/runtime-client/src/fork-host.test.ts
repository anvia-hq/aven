import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createForkHost } from "./fork-host";
import { forkWorkspace } from "./fork-workspace";
import { git } from "./git-clone";

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const FORK = "abcdef12-0000-4000-8000-000000000000";

async function parentAndFork() {
  const base = await mkdtemp(join(tmpdir(), "aven-fork-host-"));
  dirs.push(base);
  const parent = join(base, "parent");
  await mkdir(parent);
  const run = (...args: string[]) => git(args, { cwd: parent });
  await run("init", "-q", "-b", "main");
  await run("config", "user.email", "a@b.c");
  await run("config", "user.name", "A");
  await writeFile(join(parent, "a.txt"), "one\n");
  await run("add", ".");
  await run("commit", "-q", "-m", "first");
  const child = join(base, "child");
  await forkWorkspace(parent, child, FORK);
  return { parent, child };
}

const view = (lastMessage: string) => ({
  id: FORK,
  title: "Fork",
  running: false,
  archived: false,
  error: null,
  lastMessage,
});

describe("createForkHost", () => {
  test("writes a fork's changes as a patch inside the parent's .git and names its files", async () => {
    const { parent, child } = await parentAndFork();
    await writeFile(join(child, "b.txt"), "new\n");
    const host = createForkHost({
      runId: "r1",
      thread: { id: "parent" },
      sandbox: { workspace: async (id: string) => (id === FORK ? child : parent) },
      call: (async () => view("done")) as never,
    });
    const taken = await host.take(FORK);

    if (taken.empty) throw new Error("expected changes");

    expect(taken.patchPath).toBe("/workspace/.git/aven-forks/abcdef12.patch");
    expect(taken.files).toEqual(["b.txt"]);
    const patch = await readFile(join(parent, ".git", "aven-forks", "abcdef12.patch"), "utf8");
    expect(patch).toContain("+new");
    expect((await git(["status", "--porcelain"], { cwd: parent })).stdout.trim()).toBe("");
  });

  test("says when the fork has changed nothing", async () => {
    const { parent, child } = await parentAndFork();
    const host = createForkHost({
      runId: "r1",
      thread: { id: "parent" },
      sandbox: { workspace: async (id: string) => (id === FORK ? child : parent) },
      call: (async () => view("")) as never,
    });
    expect(await host.take(FORK)).toEqual({ empty: true });
  });

  test("reads nothing for an id the control plane says is not a fork of this thread", async () => {
    const { parent, child } = await parentAndFork();
    const host = createForkHost({
      runId: "r1",
      thread: { id: "parent" },
      sandbox: { workspace: async (id: string) => (id === FORK ? child : parent) },
      call: (async () => {
        throw new Error("That is not a fork of this thread");
      }) as never,
    });
    await expect(host.take(FORK)).rejects.toThrow("not a fork of this thread");
  });

  test("hides the run's secrets from what the fork said", async () => {
    const host = createForkHost({
      runId: "r1",
      thread: { id: "parent" },
      sandbox: { workspace: async () => undefined },
      call: (async () => view("the key is hunter2")) as never,
      redact: (text) => text.replaceAll("hunter2", "***"),
    });
    expect((await host.status(FORK)).lastMessage).toBe("the key is ***");
  });
});
