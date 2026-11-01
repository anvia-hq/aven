import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { updateRestoredWorkspace } from "./restore-workspace";
import { commit, gitFixture, sh } from "./testing/git-fixture";
import { threadDiff } from "./thread-diff";

const fixtures: (() => Promise<void>)[] = [];

async function setup() {
  const fixture = await gitFixture();
  fixtures.push(fixture.cleanup);
  return fixture;
}

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((cleanup) => cleanup()));
});

describe("updating a workspace restored from a snapshot", () => {
  test("puts the thread's branch on the default branch with no changes of its own", async () => {
    const { root, access, advance } = await setup();
    const moved = await advance();

    await updateRestoredWorkspace(root, "0123456789abcdef", access);

    expect(await sh(root, "rev-parse", "HEAD")).toBe(moved);
    expect(await sh(root, "rev-parse", "--abbrev-ref", "HEAD")).toBe("aven/01234567");
  });

  test("removes what the snapshot's thread left untracked, so its files are no change here", async () => {
    const { root, access } = await setup();
    await mkdir(join(root, ".aven"));
    await writeFile(join(root, ".aven", "setup"), "#!/bin/sh\n");
    await writeFile(join(root, "scratch.txt"), "left behind\n");

    await updateRestoredWorkspace(root, "0123456789abcdef", access);

    expect(await sh(root, "status", "--porcelain")).toBe("");
    expect(await Bun.file(join(root, ".aven", "setup")).exists()).toBe(false);
    expect(await threadDiff(root, "all")).toEqual({ patch: "", truncated: false });
  });

  test("keeps what git ignores, such as installed dependencies, and a local exclude", async () => {
    const { root, access } = await setup();
    await writeFile(join(root, ".gitignore"), "node_modules/\n");
    await sh(root, "add", ".gitignore");
    await commit(root, "ignore");
    await sh(root, "push", "-q", "origin", "HEAD:main");
    await mkdir(join(root, "node_modules"));
    await writeFile(join(root, "node_modules", "dep.js"), "x\n");
    await mkdir(join(root, ".pnpm-store"));
    await writeFile(join(root, ".pnpm-store", "blob"), "y\n");
    await writeFile(join(root, ".git", "info", "exclude"), ".pnpm-store/\n");

    await updateRestoredWorkspace(root, "0123456789abcdef", access);

    expect(await Bun.file(join(root, "node_modules", "dep.js")).exists()).toBe(true);
    expect(await Bun.file(join(root, ".pnpm-store", "blob")).exists()).toBe(true);
  });
});
