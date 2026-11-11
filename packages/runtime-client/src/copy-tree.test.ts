import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { copyTreeSharingObjects } from "./copy-tree";
import { git } from "./git-clone";

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

test("a copy of a repository keeps its work, ignored files and history, and still commits on its own", async () => {
  const base = await mkdtemp(join(tmpdir(), "aven-copy-"));
  dirs.push(base);
  const from = join(base, "from");
  await mkdir(from);
  const run = (cwd: string, ...args: string[]) => git(args, { cwd });
  await run(from, "init", "-q", "-b", "main");
  await run(from, "config", "user.email", "a@b.c");
  await run(from, "config", "user.name", "A");
  await writeFile(join(from, "a.txt"), "one\n");
  await run(from, "add", ".");
  await run(from, "commit", "-q", "-m", "first");
  await writeFile(join(from, "a.txt"), "one\nloose\n");
  await mkdir(join(from, "node_modules"));
  await writeFile(join(from, "node_modules", "dep.js"), "dep");

  const to = join(base, "to");
  await copyTreeSharingObjects(from, to);

  expect(await readFile(join(to, "a.txt"), "utf8")).toBe("one\nloose\n");
  expect(await readFile(join(to, "node_modules", "dep.js"), "utf8")).toBe("dep");
  expect((await run(to, "log", "--format=%s")).stdout.trim()).toBe("first");
  await run(to, "commit", "-qam", "second");
  expect((await run(to, "log", "--format=%s")).stdout.trim().split("\n")).toEqual([
    "second",
    "first",
  ]);
  expect((await run(from, "log", "--format=%s")).stdout.trim()).toBe("first");
  expect((await stat(join(from, "a.txt"))).size).toBeGreaterThan(0);
});
