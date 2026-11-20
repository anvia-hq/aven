import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { git } from "./git-clone";
import { ensureLocalExcludes } from "./local-excludes";
import { threadDiff } from "./thread-diff";

const dirs: string[] = [];
async function repo() {
  const root = await mkdtemp(join(tmpdir(), "aven-excludes-"));
  dirs.push(root);
  for (const args of [
    ["init", "-q", "-b", "main"],
    ["config", "user.email", "t@t"],
    ["config", "user.name", "t"],
  ]) {
    await git(args, { cwd: root });
  }
  await writeFile(join(root, "a.txt"), "one\n");
  await git(["add", "."], { cwd: root });
  await git(["commit", "-qm", "first"], { cwd: root });
  return root;
}
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const status = async (root: string) =>
  (await git(["status", "--short"], { cwd: root })).stdout.trim();

describe("keeping package stores out of a workspace's git", () => {
  test("a store left in the repository is no longer a change", async () => {
    const root = await repo();
    await mkdir(join(root, ".pnpm-store", "v3", "files"), { recursive: true });
    await writeFile(join(root, ".pnpm-store", "v3", "files", "blob"), "x".repeat(1000));
    expect(await status(root)).toContain(".pnpm-store/");

    await ensureLocalExcludes(root);

    expect(await status(root)).toBe("");
    expect((await threadDiff(root, "all"))?.patch).toBe("");
    await git(["add", "--all"], { cwd: root });
    expect((await git(["diff", "--cached", "--name-only"], { cwd: root })).stdout.trim()).toBe("");
  });

  test("other files still show, and the repository's own .gitignore is untouched", async () => {
    const root = await repo();
    await writeFile(join(root, ".gitignore"), "node_modules\n");
    await writeFile(join(root, "new.txt"), "n\n");

    await ensureLocalExcludes(root);

    expect(await status(root)).toContain("new.txt");
    expect(await readFile(join(root, ".gitignore"), "utf8")).toBe("node_modules\n");
  });

  test("is done once however often it is asked, and keeps what the exclude file already had", async () => {
    const root = await repo();
    await writeFile(join(root, ".git", "info", "exclude"), "*.log");

    await ensureLocalExcludes(root);
    await ensureLocalExcludes(root);

    const text = await readFile(join(root, ".git", "info", "exclude"), "utf8");
    expect(text).toBe(
      "*.log\n# Aven: package manager stores, which are never part of a change\n.pnpm-store/\n",
    );
  });

  test("a store the exclude file already names is not named again", async () => {
    const root = await repo();
    await writeFile(join(root, ".git", "info", "exclude"), ".pnpm-store\n");

    await ensureLocalExcludes(root);

    expect(await readFile(join(root, ".git", "info", "exclude"), "utf8")).toBe(".pnpm-store\n");
  });

  test("a folder that is not a clone is left alone", async () => {
    const dir = await mkdtemp(join(tmpdir(), "aven-not-a-repo-"));
    dirs.push(dir);

    await ensureLocalExcludes(dir);

    expect(await Bun.file(join(dir, ".git")).exists()).toBe(false);
  });
});
