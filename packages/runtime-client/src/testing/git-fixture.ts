import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { git } from "../git-clone";
import type { RepoAccess } from "@aven/protocol/types";

export async function sh(cwd: string, ...args: string[]) {
  const result = await git(args, { cwd });

  if (result.code !== 0) throw new Error(result.stderr);

  return result.stdout.trim();
}

export const commit = (cwd: string, message: string) =>
  sh(cwd, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qam", message);

export async function gitFixture() {
  const base = await mkdtemp(join(tmpdir(), "aven-git-fixture-"));
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
  const advance = async () => {
    await writeFile(join(seed, "a.txt"), "two\n");
    await commit(seed, "second");
    await sh(seed, "push", "-q", remote, "main");
    return sh(seed, "rev-parse", "HEAD");
  };
  return {
    root,
    remote,
    access,
    advance,
    cleanup: () => rm(base, { recursive: true, force: true }),
  };
}
