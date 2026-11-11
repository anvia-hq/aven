import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, realpath, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createFolder, listFolders } from "./folder-browser";

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function served() {
  const base = await realpath(await mkdtemp(join(tmpdir(), "aven-browse-")));
  dirs.push(base);
  const root = join(base, "code");
  await mkdir(join(root, "app", ".git"), { recursive: true });
  await mkdir(join(root, "notes"));
  await mkdir(join(root, ".hidden"));
  await mkdir(join(base, "secret"));
  return { base, root };
}

test("with no path it lists the folders the runner serves", async () => {
  const { root } = await served();
  const listed = await listFolders([root], undefined);
  expect(listed).toEqual({
    path: null,
    parent: null,
    folders: [{ name: "code", path: root, git: false }],
  });
});

test("it lists subfolders, marks git ones, hides dot folders and stops at the served root", async () => {
  const { root } = await served();
  const listed = await listFolders([root], root);
  expect(listed.folders).toEqual([
    { name: "app", path: join(root, "app"), git: true },
    { name: "notes", path: join(root, "notes"), git: false },
  ]);
  expect(listed.parent).toBeNull();
  expect((await listFolders([root], join(root, "app"))).parent).toBe(root);
});

test("it refuses what is outside the served folders, a link out of them included", async () => {
  const { base, root } = await served();
  await expect(listFolders([root], base)).rejects.toThrow("does not serve");
  await expect(listFolders([root], join(root, "..", "secret"))).rejects.toThrow("does not serve");
  await symlink(join(base, "secret"), join(root, "out"));
  await expect(listFolders([root], join(root, "out"))).rejects.toThrow("does not serve");
});

test("it makes a folder inside a served one, and refuses a bad name or a place outside", async () => {
  const { base, root } = await served();
  const made = await createFolder([root], root, "fresh");
  expect(made.path).toBe(join(root, "fresh"));
  await expect(createFolder([root], root, "fresh")).rejects.toThrow("already exists");
  await expect(createFolder([root], root, "../x")).rejects.toThrow("slash");
  await expect(createFolder([root], root, "..")).rejects.toThrow("cannot be empty");
  await expect(createFolder([root], base, "x")).rejects.toThrow("does not serve");
  await expect(createFolder([], root, "x")).rejects.toThrow("serves no folders");
});
