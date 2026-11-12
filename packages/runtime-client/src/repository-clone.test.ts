import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { git } from "./git-clone";
import { cloneRepositoryFolder } from "./repository-clone";
import type { Git } from "./types";

const folders: string[] = [];

afterEach(async () => {
  await Promise.all(folders.splice(0).map((folder) => rm(folder, { recursive: true })));
});

const scratch = async () => {
  const folder = await mkdtemp(join(tmpdir(), "aven-repository-"));
  folders.push(folder);
  return folder;
};

async function remote() {
  const root = await scratch();
  const work = join(root, "work");
  const bare = join(root, "remote.git");
  await git(["init", "-q", "-b", "main", work], { cwd: root });
  await git(["config", "user.email", "a@b.c"], { cwd: work });
  await git(["config", "user.name", "A"], { cwd: work });
  await writeFile(join(work, "one.txt"), "1");
  await git(["add", "."], { cwd: work });
  await git(["commit", "-q", "-m", "one"], { cwd: work });
  await git(["clone", "-q", "--bare", work, bare], { cwd: root });
  const run: Git = (args, options) =>
    git(
      args.map((arg) => (arg === "https://github.com/acme/app.git" ? bare : arg)),
      options,
    );
  return { work, bare, run };
}

test("clones a repository once into repos/<host>/<owner>/<name> and fetches it on the next add", async () => {
  const { work, bare, run } = await remote();
  const repos = await scratch();
  const first = await cloneRepositoryFolder(repos, "acme/app", run);
  expect(first.path.endsWith(join("github.com", "acme", "app"))).toBe(true);
  expect(existsSync(join(first.path, "one.txt"))).toBe(true);

  await writeFile(join(work, "two.txt"), "2");
  await git(["add", "."], { cwd: work });
  await git(["commit", "-q", "-m", "two"], { cwd: work });
  await git(["push", "-q", bare, "main"], { cwd: work });

  const second = await cloneRepositoryFolder(repos, "https://github.com/acme/app", run);
  expect(second.path).toBe(first.path);
  expect(existsSync(join(first.path, "two.txt"))).toBe(true);
});

test("says it could not clone, and leaves nothing behind", async () => {
  const repos = await scratch();
  const failing: Git = async () => ({ code: 128, stdout: "", stderr: "repository not found" });
  await expect(cloneRepositoryFolder(repos, "acme/none", failing)).rejects.toThrow(
    "Could not clone https://github.com/acme/none.git: repository not found",
  );
  expect(existsSync(join(repos, "github.com", "acme", "none"))).toBe(false);
});
