import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { git } from "./git-clone";
import { currentBranch, markTurn, threadDiff } from "./thread-diff";

const roots: string[] = [];

async function workspace({ branchClone = false } = {}) {
  const base = await mkdtemp(join(tmpdir(), "aven-thread-diff-"));
  roots.push(base);
  const remote = join(base, "remote");
  const root = join(base, "work");
  const sh = async (cwd: string, ...args: string[]) => {
    const result = await git(args, { cwd });

    if (result.code !== 0) throw new Error(result.stderr);
  };
  await Bun.$`mkdir ${remote} ${root}`;
  await sh(remote, "init", "-q", "-b", "main");
  await writeFile(join(remote, "a.txt"), "one\ntwo\n");
  await sh(remote, "add", ".");
  await sh(remote, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "first");
  const clone = branchClone ? ["--single-branch", "--branch", "main"] : [];
  await sh(root, "clone", "-q", ...clone, remote, ".");
  await sh(root, "checkout", "-q", "-b", "aven/test");
  return { root, sh };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("a thread's changes", () => {
  test("a folder that is no repository has none", async () => {
    const dir = await mkdtemp(join(tmpdir(), "aven-not-a-repo-"));
    roots.push(dir);
    expect(await markTurn(dir)).toBe(false);
    expect(await threadDiff(dir, "all")).toBeNull();
  });

  test("the branch the workspace is on is named, and a detached head has none", async () => {
    const { root, sh } = await workspace();
    expect(await currentBranch(root)).toBe("aven/test");
    await sh(root, "checkout", "-q", "--detach");
    expect(await currentBranch(root)).toBeNull();
  });

  test("the whole branch shows committed work too, in a clone made as Aven makes it (no origin/HEAD)", async () => {
    const { root, sh } = await workspace({ branchClone: true });
    await sh(root, "update-ref", "-d", "--no-deref", "refs/remotes/origin/HEAD");
    expect(
      await git(["rev-parse", "--verify", "--quiet", "origin/HEAD"], { cwd: root }),
    ).toMatchObject({ code: 1 });
    await writeFile(join(root, "b.txt"), "new\n");
    await sh(root, "add", ".");
    await sh(root, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "work");

    const diff = await threadDiff(root, "all");

    expect(diff?.patch).toContain("+++ b/b.txt");
  });

  test("what is unshipped is what the pushed branch lacks, and the whole branch stays whole after a push", async () => {
    const { root, sh } = await workspace({ branchClone: true });
    const commit = (message: string) =>
      sh(root, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", message);
    await writeFile(join(root, "b.txt"), "new\n");
    await sh(root, "add", ".");
    await commit("work");

    expect((await threadDiff(root, "unshipped"))?.patch).toContain("+++ b/b.txt");

    await sh(root, "push", "-q", "-u", "origin", "HEAD");
    expect((await threadDiff(root, "unshipped"))?.patch).toBe("");
    expect((await threadDiff(root, "all"))?.patch).toContain("+++ b/b.txt");

    await writeFile(join(root, "c.txt"), "later\n");
    const later = (await threadDiff(root, "unshipped"))?.patch;
    expect(later).toContain("+++ b/c.txt");
    expect(later).not.toContain("b.txt");
  });

  test("nothing is unshipped once the branch holds nothing beyond the default branch", async () => {
    const { root, sh } = await workspace({ branchClone: true });
    const commit = (message: string) =>
      sh(root, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", message);
    await sh(join(root, "..", "remote"), "config", "receive.denyCurrentBranch", "updateInstead");
    await threadDiff(root, "unshipped");
    await writeFile(join(root, "b.txt"), "new\n");
    await sh(root, "add", ".");
    await commit("work");
    await sh(root, "push", "-q", "-u", "origin", "HEAD");
    await writeFile(join(root, "d.txt"), "x\n");
    await sh(root, "add", ".");
    await commit("more");
    await sh(root, "push", "-q", "origin", "HEAD:main");
    await sh(root, "fetch", "-q", "origin");
    await sh(root, "reset", "-q", "--hard", "origin/main");
    await sh(root, "checkout", "-q", "-B", "aven/test", "origin/main");
    await sh(root, "branch", "-q", "-u", "origin/aven/test");

    expect((await threadDiff(root, "all"))?.patch).toBe("");
    expect((await threadDiff(root, "unshipped"))?.patch).toBe("");
  });

  test("a branch moved to a default branch that squash-merged it shows only what is uncommitted, with the folder's main fetched on the way", async () => {
    const { root, sh } = await workspace({ branchClone: true });
    const remote = join(root, "..", "remote");
    const commit = (cwd: string, message: string) =>
      sh(cwd, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", message);
    await writeFile(join(root, "b.txt"), "new\n");
    await sh(root, "add", ".");
    await commit(root, "work");
    await threadDiff(root, "unshipped");
    await sh(root, "push", "-q", "-u", "origin", "HEAD");
    expect((await threadDiff(root, "unshipped"))?.patch).toBe("");

    await writeFile(join(remote, "b.txt"), "new\n");
    await writeFile(join(remote, "c.txt"), "others\n");
    await sh(remote, "add", ".");
    await commit(remote, "squashed work and others");
    await sh(root, "fetch", "-q", "--", remote, "main");
    await sh(root, "reset", "-q", "--hard", "FETCH_HEAD");
    await writeFile(join(root, "d.txt"), "edit\n");

    const unshipped = (await threadDiff(root, "unshipped"))?.patch;
    expect(unshipped).toContain("+++ b/d.txt");
    expect(unshipped).not.toContain("b.txt");
    expect(unshipped).not.toContain("c.txt");
    const whole = (await threadDiff(root, "all"))?.patch;
    expect(whole).toContain("+++ b/d.txt");
    expect(whole).not.toContain("c.txt");
  });

  test("a branch that pulled GitHub's main through a folder that is behind GitHub does not show the pulled commits", async () => {
    const base = await mkdtemp(join(tmpdir(), "aven-thread-diff-"));
    roots.push(base);
    const github = join(base, "github");
    const folder = join(base, "folder");
    const root = join(base, "thread");
    const sh = async (cwd: string, ...args: string[]) => {
      const result = await git(args, { cwd });

      if (result.code !== 0) throw new Error(result.stderr);
    };
    const commit = (cwd: string, message: string) =>
      sh(cwd, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", message);
    await Bun.$`mkdir ${github}`;
    await sh(github, "init", "-q", "-b", "main");
    await writeFile(join(github, "a.txt"), "one\n");
    await sh(github, "add", ".");
    await commit(github, "first");
    await sh(base, "clone", "-q", github, folder);
    await sh(base, "clone", "-q", folder, root);
    await sh(root, "checkout", "-q", "-b", "aven/test");

    await writeFile(join(github, "others.txt"), "other people's work\n");
    await sh(github, "add", ".");
    await commit(github, "merged by others");
    await sh(root, "fetch", "-q", "--", github, "main");
    await sh(
      root,
      "-c",
      "user.name=t",
      "-c",
      "user.email=t@t",
      "merge",
      "-q",
      "--no-edit",
      "FETCH_HEAD",
    );

    expect((await threadDiff(root, "unshipped"))?.patch).toBe("");
    expect((await threadDiff(root, "all"))?.patch).toBe("");

    await writeFile(join(root, "mine.txt"), "mine\n");
    const mine = (await threadDiff(root, "all"))?.patch;
    expect(mine).toContain("+++ b/mine.txt");
    expect(mine).not.toContain("others.txt");
  });

  test("work already pushed to the folder under another of the thread's branch names is not unshipped", async () => {
    const { root, sh } = await workspace({ branchClone: true });
    const remote = join(root, "..", "remote");
    const commit = (message: string) =>
      sh(root, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", message);
    await sh(root, "branch", "-m", "aven/abcdef12");
    await threadDiff(root, "unshipped");
    await writeFile(join(root, "b.txt"), "first\n");
    await sh(root, "add", ".");
    await commit("first");
    await sh(root, "push", "-q", "-u", "origin", "HEAD");
    await writeFile(join(root, "c.txt"), "second\n");
    await sh(root, "add", ".");
    await commit("second");
    await sh(remote, "fetch", "-q", root, "HEAD:refs/heads/aven/abcdef12-follow-up");

    expect((await threadDiff(root, "unshipped"))?.patch).toBe("");

    await writeFile(join(root, "d.txt"), "edit\n");
    const edited = (await threadDiff(root, "unshipped"))?.patch;
    expect(edited).toContain("+++ b/d.txt");
    expect(edited).not.toContain("c.txt");
    expect((await threadDiff(root, "all"))?.patch).toContain("+++ b/c.txt");
  });

  test("a project cloned from a server is not fetched from while its changes are read", async () => {
    const { root, sh } = await workspace({ branchClone: true });
    await sh(root, "remote", "set-url", "origin", "https://127.0.0.1:9/never.git");
    const started = Date.now();

    expect(await threadDiff(root, "all")).not.toBeNull();
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  test("the whole branch shows every change, new files included", async () => {
    const { root } = await workspace();
    await writeFile(join(root, "a.txt"), "one\nthree\n");
    await writeFile(join(root, "b.txt"), "new\n");
    const diff = await threadDiff(root, "all");
    expect(diff?.truncated).toBe(false);
    expect(diff?.patch).toContain("-two\n+three");
    expect(diff?.patch).toContain("+++ b/b.txt");
  });

  test("a turn shows only what changed since it was marked, committed or not", async () => {
    const { root, sh } = await workspace();
    await writeFile(join(root, "a.txt"), "one\nthree\n");
    expect(await markTurn(root)).toBe(true);
    expect((await threadDiff(root, "turn"))?.patch).toBe("");

    await writeFile(join(root, "b.txt"), "new\n");
    await sh(root, "add", ".");
    await sh(root, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "work");
    await writeFile(join(root, "c.txt"), "later\n");

    const turn = (await threadDiff(root, "turn"))?.patch ?? "";
    expect(turn).toContain("+++ b/b.txt");
    expect(turn).toContain("+++ b/c.txt");
    expect(turn).not.toContain("three");
    expect((await threadDiff(root, "all"))?.patch).toContain("+three");
  });

  test("leaves the thread's own staging area and ignored files alone", async () => {
    const { root } = await workspace();
    await writeFile(join(root, ".gitignore"), "ignored.txt\n");
    await writeFile(join(root, "ignored.txt"), "secret\n");
    await markTurn(root);
    await threadDiff(root, "all");
    const staged = await git(["diff", "--cached", "--name-only"], { cwd: root });
    expect(staged.stdout).toBe("");
    expect((await threadDiff(root, "all"))?.patch).not.toContain("secret");
  });

  test("a thread that never marked a turn has an empty turn", async () => {
    const { root } = await workspace();
    await writeFile(join(root, "b.txt"), "x\n");
    expect(await threadDiff(root, "turn")).toEqual({ patch: "", truncated: false });
  });
});
