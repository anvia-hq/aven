import { afterEach, describe, expect, test } from "bun:test";
import { chmod, mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SNAPSHOT_MAX_AGE_MS, SnapshotStore, copyTree } from "./snapshots";

const dirs: string[] = [];
async function temp() {
  const dir = await mkdtemp(join(tmpdir(), "aven-snapshots-"));
  dirs.push(dir);
  return dir;
}
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function preparedWorkspace() {
  const dir = await temp();
  await writeFile(join(dir, "package.json"), "{}");
  await mkdir(join(dir, "node_modules", "left-pad"), { recursive: true });
  await writeFile(join(dir, "node_modules", "left-pad", "index.js"), "module.exports = 1");
  await mkdir(join(dir, ".aven"));
  await writeFile(join(dir, ".aven", "setup"), "#!/bin/sh\n");
  await symlink("package.json", join(dir, "link.json"));
  return dir;
}

describe("snapshots", () => {
  test("the same repository of the same organization has one key, and another differs", async () => {
    const store = new SnapshotStore(await temp());

    const key = store.keyFor("org-1", "https://github.com/acme/web.git");

    expect(key).toMatch(/^[0-9a-f]{24}$/);
    expect(store.keyFor("org-1", "https://github.com/acme/web.git")).toBe(key);
    expect(store.keyFor("org-2", "https://github.com/acme/web.git")).not.toBe(key);
    expect(store.keyFor("org-1", "https://github.com/acme/api.git")).not.toBe(key);
    expect(store.imageFor(key)).toBe(`aven-env-${key}`);
  });

  test("there is none until one is published, and then it holds a copy of the workspace", async () => {
    const store = new SnapshotStore(await temp());
    const key = "k1";
    expect(await store.valid(key, "sha256:base")).toBeNull();

    const published = await store.publish(key, {
      image: "aven-env-k1",
      baseImageId: "sha256:base",
      workspace: await preparedWorkspace(),
    });

    const found = await store.valid(key, "sha256:base");
    expect(found).toEqual(published);
    expect(found?.image).toBe("aven-env-k1");
    expect(
      await readFile(join(published.workspace, "node_modules", "left-pad", "index.js"), "utf8"),
    ).toBe("module.exports = 1");
    expect(await readFile(join(published.workspace, ".aven", "setup"), "utf8")).toBe("#!/bin/sh\n");
    expect(await readFile(join(published.workspace, "link.json"), "utf8")).toBe("{}");
  });

  test("a package manager's store is not kept: it is a cache that can be hundreds of megabytes", async () => {
    const store = new SnapshotStore(await temp());
    const workspace = await preparedWorkspace();
    await mkdir(join(workspace, ".pnpm-store", "v3"), { recursive: true });
    await writeFile(join(workspace, ".pnpm-store", "v3", "blob"), "x".repeat(10_000));

    const snapshot = await store.publish("k1", { image: "i", baseImageId: "b", workspace });

    expect((await readdir(snapshot.workspace)).sort()).toEqual([
      ".aven",
      "link.json",
      "node_modules",
      "package.json",
    ]);
    expect(await readdir(workspace)).toContain(".pnpm-store");
  });

  test("restoring puts the workspace, hidden files and all, where a thread wants it", async () => {
    const store = new SnapshotStore(await temp());
    const snapshot = await store.publish("k1", {
      image: "aven-env-k1",
      baseImageId: "b",
      workspace: await preparedWorkspace(),
    });
    const to = join(await temp(), "workspaces", "thread-1");

    await store.restore(snapshot, to);

    expect((await readdir(to)).sort()).toEqual([
      ".aven",
      "link.json",
      "node_modules",
      "package.json",
    ]);
    await writeFile(join(to, "package.json"), "changed");
    expect(await readFile(join(snapshot.workspace, "package.json"), "utf8")).toBe("{}");
  });

  test("is not used once it is older than 72 hours, or when the sandbox image changed", async () => {
    let now = Date.parse("2026-11-01T00:00:00Z");
    const store = new SnapshotStore(await temp(), () => now);
    await store.publish("k1", {
      image: "i",
      baseImageId: "b1",
      workspace: await preparedWorkspace(),
    });

    now += SNAPSHOT_MAX_AGE_MS - 1000;
    expect(await store.valid("k1", "b1")).not.toBeNull();
    expect(await store.valid("k1", "b2")).toBeNull();
    now += 2000;
    expect(await store.valid("k1", "b1")).toBeNull();
  });

  test("a new one replaces the old, and a folder without meta is not a snapshot", async () => {
    const root = await temp();
    const store = new SnapshotStore(root);
    await store.publish("k1", {
      image: "old",
      baseImageId: "b",
      workspace: await preparedWorkspace(),
    });
    const other = await temp();
    await writeFile(join(other, "new.txt"), "n");

    await store.publish("k1", { image: "new", baseImageId: "b", workspace: other });

    const found = await store.valid("k1", "b");
    expect(found?.image).toBe("new");
    expect(await readdir(found!.workspace)).toEqual(["new.txt"]);

    await mkdir(join(root, "k2", "workspace"), { recursive: true });
    expect(await store.valid("k2", "b")).toBeNull();
    await mkdir(join(root, "k3"), { recursive: true });
    await writeFile(join(root, "k3", "meta.json"), "not json");
    expect(await store.valid("k3", "b")).toBeNull();
  });

  test("a publish that fails leaves the old snapshot and no litter", async () => {
    const root = await temp();
    const store = new SnapshotStore(root);
    await store.publish("k1", {
      image: "old",
      baseImageId: "b",
      workspace: await preparedWorkspace(),
    });

    await expect(
      store.publish("k1", {
        image: "new",
        baseImageId: "b",
        workspace: join(root, "does-not-exist"),
      }),
    ).rejects.toThrow("Could not copy");

    expect((await store.valid("k1", "b"))?.image).toBe("old");
    expect((await readdir(root)).filter((name) => name.includes("building"))).toEqual([]);
  });

  test("remove deletes it", async () => {
    const store = new SnapshotStore(await temp());
    await store.publish("k1", {
      image: "i",
      baseImageId: "b",
      workspace: await preparedWorkspace(),
    });

    await store.remove("k1");

    expect(await store.valid("k1", "b")).toBeNull();
  });
});

describe("copying a workspace", () => {
  test("goes over what an earlier copy left, read-only git packs included", async () => {
    const from = await temp();
    const to = join(await temp(), "workspace");
    const pack = join(".git", "objects", "pack", "pack-1.pack");
    await mkdir(join(from, ".git", "objects", "pack"), { recursive: true });
    await writeFile(join(from, pack), "objects");
    await chmod(join(from, pack), 0o444);

    await copyTree(from, to);
    await copyTree(from, to);

    expect(await readFile(join(to, pack), "utf8")).toBe("objects");
  });
});
