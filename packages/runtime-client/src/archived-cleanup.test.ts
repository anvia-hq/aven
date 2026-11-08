import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ArchivedCleanup } from "./archived-cleanup";
import { SNAPSHOT_MAX_AGE_MS } from "./snapshots";
import type { CommandOutput } from "./types";

const DAY = 24 * 60 * 60 * 1000;
const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function setup({
  keepMs = 7 * DAY,
  inUse = new Set<string>(),
  refuse = new Set<string>(),
} = {}) {
  const home = await mkdtemp(join(tmpdir(), "aven-archived-"));
  dirs.push(home);
  let now = Date.parse("2026-11-08T00:00:00Z");
  const removedImages: string[] = [];
  const docker = async (args: string[]): Promise<CommandOutput> => {
    if (args[0] === "rmi") {
      if (refuse.has(args[1]!)) return { code: 1, stdout: "", stderr: "image is being used" };
      removedImages.push(args[1]!);
    }
    return { code: 0, stdout: "", stderr: "" };
  };
  const cleanup = new ArchivedCleanup({
    home,
    keepMs,
    docker,
    inUse: (id) => inUse.has(id),
    now: () => now,
  });
  const workspace = async (id: string) => {
    await mkdir(join(home, "workspaces", id), { recursive: true });
    await writeFile(join(home, "workspaces", id, "file"), "x");
    await mkdir(join(home, "skills", "threads", id), { recursive: true });
    await mkdir(join(home, "environments"), { recursive: true });
    await writeFile(join(home, "environments", `${id}.image`), `aven-env-${id.slice(0, 4)}`);
  };
  const computer = async (id: string) => {
    await mkdir(join(home, "bot-computers"), { recursive: true });
    await writeFile(join(home, "bot-computers", id), "");
  };
  const files = async (id: string) => {
    await mkdir(join(home, "uploads", id), { recursive: true });
    await writeFile(join(home, "uploads", id, "notes.txt"), "x");
    await mkdir(join(home, "artifacts", id), { recursive: true });
    await writeFile(join(home, "artifacts", id, "image.png"), "x");
    await computer(id);
  };
  const snapshot = async (key: string, ageMs: number) => {
    await mkdir(join(home, "snapshots", key, "workspace"), { recursive: true });
    await writeFile(
      join(home, "snapshots", key, "meta.json"),
      JSON.stringify({
        image: `aven-env-${key}`,
        baseImageId: "sha256:b",
        createdAt: new Date(now - ageMs).toISOString(),
      }),
    );
  };
  return {
    home,
    cleanup,
    removedImages,
    workspace,
    files,
    computer,
    snapshot,
    advance: (ms: number) => void (now += ms),
    has: (...parts: string[]) => existsSync(join(home, ...parts)),
  };
}

describe("a thread put away", () => {
  test("keeps its workspace until the days are up, then removes it with what belongs to it", async () => {
    const t = await setup();
    await t.workspace("aaaa-1");
    await t.cleanup.mark("aaaa-1");

    t.advance(6 * DAY);
    expect(await t.cleanup.sweep()).toEqual([]);
    expect(t.has("workspaces", "aaaa-1")).toBe(true);

    t.advance(2 * DAY);
    expect(await t.cleanup.sweep()).toEqual(["aaaa-1"]);
    expect(t.has("workspaces", "aaaa-1")).toBe(false);
    expect(t.has("skills", "threads", "aaaa-1")).toBe(false);
    expect(t.has("environments", "aaaa-1.image")).toBe(false);
    expect(t.has("archived", "aaaa-1")).toBe(false);
  });

  test("a thread that runs again is not removed", async () => {
    const t = await setup();
    await t.workspace("aaaa-1");
    await t.cleanup.mark("aaaa-1");
    await t.cleanup.clear("aaaa-1");

    t.advance(30 * DAY);
    expect(await t.cleanup.sweep()).toEqual([]);
    expect(t.has("workspaces", "aaaa-1")).toBe(true);
  });

  test("a thread that is in use is left alone", async () => {
    const t = await setup({ inUse: new Set(["aaaa-1"]) });
    await t.workspace("aaaa-1");
    await t.cleanup.mark("aaaa-1");

    t.advance(30 * DAY);
    expect(await t.cleanup.sweep()).toEqual([]);
    expect(t.has("workspaces", "aaaa-1")).toBe(true);
  });

  test("with no days to keep, workspaces are kept for ever", async () => {
    const t = await setup({ keepMs: 0 });
    await t.workspace("aaaa-1");
    await t.cleanup.mark("aaaa-1");

    t.advance(400 * DAY);
    expect(await t.cleanup.sweep()).toEqual([]);
    expect(t.has("workspaces", "aaaa-1")).toBe(true);
  });

  test("a name that is not a thread id is never used as a path", async () => {
    const t = await setup();
    await t.cleanup.mark("../outside");
    expect(t.has("archived")).toBe(false);
  });
});

describe("what a thread leaves on the runner", () => {
  test("its uploads, its artifacts and its computer mark go too, and an open thread keeps its own", async () => {
    const t = await setup();
    await t.workspace("aaaa-1");
    await t.workspace("bbbb-2");
    await t.files("aaaa-1");
    await t.files("bbbb-2");
    await t.computer("bot-1");
    await t.cleanup.mark("aaaa-1");

    t.advance(8 * DAY);
    expect(await t.cleanup.sweep()).toEqual(["aaaa-1"]);

    expect(t.has("uploads", "aaaa-1")).toBe(false);
    expect(t.has("artifacts", "aaaa-1")).toBe(false);
    expect(t.has("bot-computers", "aaaa-1")).toBe(false);

    expect(t.has("uploads", "bbbb-2", "notes.txt")).toBe(true);
    expect(t.has("artifacts", "bbbb-2", "image.png")).toBe(true);
    expect(t.has("bot-computers", "bbbb-2")).toBe(true);
  });

  test("a computer mark left with no computer here is pruned, whoever wrote it", async () => {
    const t = await setup();
    await t.workspace("bbbb-2");
    await t.computer("bbbb-2");
    await t.computer("bot-1");

    expect(await t.cleanup.sweep()).toEqual([]);

    expect(t.has("bot-computers", "bbbb-2")).toBe(true);
    expect(t.has("bot-computers", "bot-1")).toBe(false);
  });

  test("no computer mark goes for a thread that is still in use", async () => {
    const t = await setup({ inUse: new Set(["aaaa-1"]) });
    await t.computer("aaaa-1");

    expect(await t.cleanup.sweep()).toEqual([]);
    expect(t.has("bot-computers", "aaaa-1")).toBe(true);
  });
});

describe("environment images", () => {
  test("an expired snapshot that no thread uses goes with its image", async () => {
    const t = await setup();
    await t.snapshot("old", SNAPSHOT_MAX_AGE_MS + DAY);
    await t.snapshot("fresh", DAY);

    await t.cleanup.sweep();
    expect(t.removedImages).toEqual(["aven-env-old"]);
    expect(t.has("snapshots", "old")).toBe(false);
    expect(t.has("snapshots", "fresh")).toBe(true);
  });

  test("an image a thread still uses stays, even when its snapshot has expired", async () => {
    const t = await setup();
    await t.snapshot("old", SNAPSHOT_MAX_AGE_MS + DAY);
    await mkdir(join(t.home, "environments"), { recursive: true });
    await writeFile(join(t.home, "environments", "bbbb-2.image"), "aven-env-old");

    await t.cleanup.sweep();
    expect(t.removedImages).toEqual([]);
    expect(t.has("snapshots", "old")).toBe(true);
  });

  test("an image docker will not remove keeps its snapshot too", async () => {
    const t = await setup({ refuse: new Set(["aven-env-old"]) });
    await t.snapshot("old", SNAPSHOT_MAX_AGE_MS + DAY);

    await t.cleanup.sweep();
    expect(t.has("snapshots", "old")).toBe(true);
  });

  test("a thread's image is freed once its workspace is removed", async () => {
    const t = await setup();
    await t.snapshot("aaaa", SNAPSHOT_MAX_AGE_MS + DAY);
    await t.workspace("aaaa-1");
    await t.cleanup.mark("aaaa-1");

    t.advance(8 * DAY);
    await t.cleanup.sweep();
    expect(t.removedImages).toEqual(["aven-env-aaaa"]);
  });
});
