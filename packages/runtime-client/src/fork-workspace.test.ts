import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { forkWorkspace } from "./fork-workspace";
import { git } from "./git-clone";
import { forkChanges } from "./thread-diff";

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function parentWorkspace() {
  const base = await mkdtemp(join(tmpdir(), "aven-fork-"));
  dirs.push(base);
  const parent = join(base, "parent");
  await mkdir(parent);
  const run = (...args: string[]) => git(args, { cwd: parent });
  await run("init", "-q", "-b", "main");
  await run("config", "user.email", "a@b.c");
  await run("config", "user.name", "A");
  await writeFile(join(parent, ".gitignore"), "node_modules\n");
  await writeFile(join(parent, "a.txt"), "one\n");
  await run("add", ".");
  await run("commit", "-q", "-m", "first");
  return { base, parent, run };
}

describe("forkWorkspace", () => {
  test("copies the working tree, uncommitted work and ignored files, on a branch of its own", async () => {
    const { base, parent } = await parentWorkspace();
    await writeFile(join(parent, "a.txt"), "one\nparent edit\n");
    await mkdir(join(parent, "node_modules"));
    await writeFile(join(parent, "node_modules", "dep.js"), "dep");
    const child = join(base, "child");
    await forkWorkspace(parent, child, "abcdef12-0000-4000-8000-000000000000");

    expect(await readFile(join(child, "a.txt"), "utf8")).toBe("one\nparent edit\n");
    expect(await readFile(join(child, "node_modules", "dep.js"), "utf8")).toBe("dep");
    const branch = await git(["branch", "--show-current"], { cwd: child });
    expect(branch.stdout.trim()).toBe("aven/abcdef12");
    expect((await git(["branch", "--show-current"], { cwd: parent })).stdout.trim()).toBe("main");
  });

  test("tells the fork's changes from the parent's, commits and loose files alike", async () => {
    const { base, parent } = await parentWorkspace();
    await writeFile(join(parent, "a.txt"), "one\nparent edit\n");
    const child = join(base, "child");
    await forkWorkspace(parent, child, "abcdef12-0000-4000-8000-000000000000");
    expect((await forkChanges(child))?.patch).toBe("");

    await writeFile(join(child, "b.txt"), "committed\n");
    await git(["add", "b.txt"], { cwd: child });
    await git(["-c", "user.email=a@b.c", "-c", "user.name=A", "commit", "-q", "-m", "b"], {
      cwd: child,
    });
    await writeFile(join(child, "c.txt"), "loose\n");

    const patch = (await forkChanges(child))?.patch ?? "";
    expect(patch).toContain("b/b.txt");
    expect(patch).toContain("b/c.txt");
    expect(patch).not.toContain("parent edit");
  });

  test("has no changes to give for a workspace that was never forked", async () => {
    const { parent } = await parentWorkspace();
    expect(await forkChanges(parent)).toBeNull();
  });
});
