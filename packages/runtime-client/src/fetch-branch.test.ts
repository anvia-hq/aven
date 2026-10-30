import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RepoAccess } from "@aven/protocol/runtime-wire";

import { fetchBranch, isBranchName } from "./fetch-branch";
import { git, type Git } from "./git-clone";

const dirs: string[] = [];

async function sh(cwd: string, ...args: string[]) {
  const result = await git(args, { cwd });
  if (result.code !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}

const commit = (cwd: string, message: string) =>
  sh(cwd, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qam", message);

// A remote with `main` and `other`, a clone of it made as Aven makes it (one named branch), and a
// second checkout of the remote to move its branches on.
async function setup() {
  const base = await mkdtemp(join(tmpdir(), "aven-fetch-"));
  dirs.push(base);
  const remote = join(base, "remote.git");
  const seed = join(base, "seed");
  const root = join(base, "work");
  await Bun.$`mkdir ${seed} ${root}`;
  await sh(base, "init", "-q", "--bare", "-b", "main", remote);
  await sh(seed, "init", "-q", "-b", "main");
  await writeFile(join(seed, "a.txt"), "one\n");
  await sh(seed, "add", ".");
  await commit(seed, "first");
  await sh(seed, "push", "-q", remote, "main");
  await sh(seed, "checkout", "-q", "-b", "other");
  await writeFile(join(seed, "b.txt"), "other\n");
  await sh(seed, "add", ".");
  await commit(seed, "on other");
  await sh(seed, "push", "-q", remote, "other");
  await sh(seed, "checkout", "-q", "main");
  await sh(root, "clone", "-q", "--single-branch", "--branch", "main", remote, ".");
  await sh(root, "checkout", "-q", "-b", "aven/test");
  const access: RepoAccess = { cloneUrl: remote, defaultBranch: "main", token: "secret-token" };
  // Moves main on in the remote, as a teammate's merge would.
  const advance = async () => {
    await writeFile(join(seed, "a.txt"), "two\n");
    await commit(seed, "second");
    await sh(seed, "push", "-q", remote, "main");
    return sh(seed, "rev-parse", "HEAD");
  };
  return { root, remote, access, advance };
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("fetching a branch into the workspace", () => {
  test("brings the default branch up to date as origin/main and changes nothing else", async () => {
    const { root, access, advance } = await setup();
    const head = await sh(root, "rev-parse", "HEAD");
    const before = await sh(root, "rev-parse", "origin/main");
    const moved = await advance();

    const fetched = await fetchBranch(root, access);

    expect(fetched).toEqual({ branch: "main", commit: moved, previous: before });
    expect(await sh(root, "rev-parse", "origin/main")).toBe(moved);
    expect(await sh(root, "rev-parse", "HEAD")).toBe(head);
    expect(await sh(root, "rev-parse", "--abbrev-ref", "HEAD")).toBe("aven/test");
    expect(await Bun.file(join(root, "a.txt")).text()).toBe("one\n");
  });

  test("brings another branch of the repository, which the clone did not have", async () => {
    const { root, access } = await setup();
    expect(
      await git(["rev-parse", "--verify", "--quiet", "origin/other"], { cwd: root }),
    ).toMatchObject({ code: 1 });

    const fetched = await fetchBranch(root, access, "other");

    expect(fetched).toMatchObject({ branch: "other", previous: null });
    expect(await sh(root, "show", "origin/other:b.txt")).toBe("other");
  });

  test("a branch the remote does not have is an error, without the token", async () => {
    const { root, access } = await setup();

    const error = await fetchBranch(root, access, "nope").catch((thrown: Error) => thrown);

    expect((error as Error).message).toContain("Could not fetch nope");
    expect((error as Error).message).not.toContain("secret-token");
  });

  test("fetches from the repository it was given, not from a remote the workspace was rewritten to", async () => {
    const { root, access, advance } = await setup();
    await sh(root, "remote", "set-url", "origin", join(root, "..", "nowhere.git"));
    const moved = await advance();

    expect((await fetchBranch(root, access)).commit).toBe(moved);
  });

  test("a hook the workspace planted does not run", async () => {
    const { root, access } = await setup();
    const marker = join(root, "..", "hook-ran");
    const hook = join(root, ".git", "hooks", "reference-transaction");
    await writeFile(hook, `#!/bin/sh\ntouch ${marker}\n`, { mode: 0o755 });

    await fetchBranch(root, access, "other");

    expect(await Bun.file(marker).exists()).toBe(false);
  });

  test("a failed fetch does not show the token", async () => {
    const { root, access } = await setup();
    const unreachable = { ...access, cloneUrl: "http://127.0.0.1:1/secret-token.git" };

    const error = await fetchBranch(root, unreachable).catch((thrown: Error) => thrown);

    expect((error as Error).message).toContain("Could not fetch main");
    expect((error as Error).message).not.toContain("secret-token");
  });

  test("only a plain branch name is fetched, and git is not even asked about the rest", async () => {
    const { root, access } = await setup();
    const asked: string[][] = [];
    const spy: Git = async (args, options) => (asked.push(args), git(args, options));

    for (const name of [
      "",
      "-x",
      "/x",
      "../x",
      "a..b",
      "a b",
      "a//b",
      "x/",
      "x.",
      "x.lock",
      "HEAD",
      "a;b",
    ]) {
      await expect(fetchBranch(root, access, name, spy)).rejects.toThrow("is not a branch name");
    }
    expect(asked).toEqual([]);
    for (const name of ["main", "feature/x-1", "release-1.2", "aven/abc12345"]) {
      expect(isBranchName(name)).toBe(true);
    }
  });
});
