import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RepoPushParams } from "@aven/protocol/runtime-wire";

import { git } from "./git-clone";
import { publishBranch } from "./publish-branch";

const dirs: string[] = [];

async function sh(cwd: string, ...args: string[]) {
  const result = await git(args, { cwd });
  if (result.code !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}

// A bare remote with one commit on main, and a clone of it on the thread's branch.
async function workspace({ branchClone = false } = {}) {
  const base = await mkdtemp(join(tmpdir(), "aven-publish-"));
  dirs.push(base);
  const remote = join(base, "remote.git");
  const seed = join(base, "seed");
  const root = join(base, "work");
  await Bun.$`mkdir ${seed} ${root}`;
  await sh(base, "init", "-q", "--bare", "-b", "main", remote);
  await sh(seed, "init", "-q", "-b", "main");
  await writeFile(join(seed, "a.txt"), "one\n");
  await sh(seed, "add", ".");
  await sh(seed, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "first");
  await sh(seed, "push", "-q", remote, "main");
  // Aven clones one named branch, which leaves `origin/HEAD` unset (decision 0013).
  const clone = branchClone ? ["--single-branch", "--branch", "main"] : [];
  await sh(root, "clone", "-q", ...clone, remote, ".");
  await sh(root, "checkout", "-q", "-b", "aven/test");
  const params: RepoPushParams = {
    threadId: "thread",
    cloneUrl: remote,
    branch: "aven/test",
    token: "secret-token",
    commitMessage: "Change a",
    author: { name: "Ada", email: "ada@example.com" },
  };
  return { root, remote, params };
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("publishing a thread's branch", () => {
  test("commits the changes as the author and pushes the branch", async () => {
    const { root, remote, params } = await workspace();
    await writeFile(join(root, "a.txt"), "two\n");
    await writeFile(join(root, "b.txt"), "new\n");

    const result = await publishBranch(root, params);

    const head = await sh(root, "rev-parse", "HEAD");
    expect(result).toEqual({ kind: "pushed", commit: head });
    expect(await sh(remote, "rev-parse", "aven/test")).toBe(head);
    expect(await sh(remote, "log", "-1", "--format=%an <%ae>|%s", "aven/test")).toBe(
      "Ada <ada@example.com>|Change a",
    );
  });

  test("a second push after more work adds to the same branch", async () => {
    const { root, remote, params } = await workspace();
    await writeFile(join(root, "a.txt"), "two\n");
    await publishBranch(root, params);
    await writeFile(join(root, "a.txt"), "three\n");

    await publishBranch(root, { ...params, commitMessage: "Change a again" });

    expect(await sh(remote, "rev-list", "--count", "main..aven/test")).toBe("2");
  });

  test("pushes work the agent already committed", async () => {
    const { root, remote, params } = await workspace();
    await writeFile(join(root, "a.txt"), "two\n");
    await sh(root, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qam", "By the agent");

    expect((await publishBranch(root, params)).kind).toBe("pushed");
    expect(await sh(remote, "log", "-1", "--format=%s", "aven/test")).toBe("By the agent");
  });

  test("a branch with no change is not pushed, in a clone made as Aven makes it (no origin/HEAD)", async () => {
    const { root, remote, params } = await workspace({ branchClone: true });

    expect(await publishBranch(root, params)).toEqual({ kind: "nothing" });
    expect(await sh(remote, "branch", "--list", "aven/test")).toBe("");
  });

  test("a branch with no change is not pushed", async () => {
    const { root, remote, params } = await workspace();

    expect(await publishBranch(root, params)).toEqual({ kind: "nothing" });
    expect(await sh(remote, "branch", "--list", "aven/test")).toBe("");
  });

  test("another branch than the thread's is refused", async () => {
    const { root, params } = await workspace();
    await sh(root, "checkout", "-q", "-b", "elsewhere");
    await writeFile(join(root, "a.txt"), "two\n");

    await expect(publishBranch(root, params)).rejects.toThrow("not on the thread's branch");
  });

  test("a hook in the workspace does not run", async () => {
    const { root, params } = await workspace();
    const marker = join(root, "..", "hook-ran");
    for (const name of ["pre-commit", "pre-push"]) {
      const hook = join(root, ".git", "hooks", name);
      await writeFile(hook, `#!/bin/sh\ntouch ${marker}\n`, { mode: 0o755 });
    }
    await writeFile(join(root, "a.txt"), "two\n");

    await publishBranch(root, params);

    expect(await Bun.file(marker).exists()).toBe(false);
  });

  test("a failed push does not show the token", async () => {
    const { root, params } = await workspace();
    await writeFile(join(root, "a.txt"), "two\n");
    const unreachable = { ...params, cloneUrl: "http://127.0.0.1:1/secret-token.git" };

    const error = await publishBranch(root, unreachable).catch((thrown: Error) => thrown);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("Could not push the branch");
    expect((error as Error).message).not.toContain("secret-token");
  });
});
