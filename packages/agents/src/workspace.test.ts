import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

import {
  browseDirectory,
  createDirectory,
  DirectoryExistsError,
  InvalidFolderNameError,
  InvalidProjectPathError,
  resolveProjectPath,
} from "./workspace";

describe("resolveProjectPath", () => {
  test("accepts a directory and stores its real path", async () => {
    const dir = await mkdtemp(join(tmpdir(), "aven-path-"));
    const link = `${dir}-link`;
    await symlink(dir, link);
    try {
      expect(await resolveProjectPath(link)).toBe(await realpath(dir));
      expect(await resolveProjectPath(join(dir, "..", dir.split("/").pop()!))).toBe(
        await realpath(dir),
      );
    } finally {
      await rm(link);
      await rm(dir, { recursive: true });
    }
  });

  test("rejects relative, missing and non-directory paths", async () => {
    const dir = await mkdtemp(join(tmpdir(), "aven-path-"));
    await writeFile(join(dir, "file.txt"), "x");
    try {
      await expect(resolveProjectPath("relative/dir")).rejects.toBeInstanceOf(
        InvalidProjectPathError,
      );
      await expect(resolveProjectPath(join(dir, "nope"))).rejects.toThrow("does not exist");
      await expect(resolveProjectPath(join(dir, "file.txt"))).rejects.toThrow("Not a directory");
    } finally {
      await rm(dir, { recursive: true });
    }
  });
});

describe("browseDirectory", () => {
  test("lists only subdirectories, hides dot-directories and sorts case-insensitively", async () => {
    const dir = await mkdtemp(join(tmpdir(), "aven-browse-"));
    await mkdir(join(dir, "Banana"));
    await mkdir(join(dir, "apple"));
    await mkdir(join(dir, ".hidden"));
    await writeFile(join(dir, "file.txt"), "x");
    try {
      const listing = await browseDirectory(dir);
      expect(listing.path).toBe(await realpath(dir));
      expect(listing.entries.map((entry) => entry.name)).toEqual(["apple", "Banana"]);
      expect(listing.entries[0]!.path).toBe(join(await realpath(dir), "apple"));
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  test("defaults to the home directory when no path is given", async () => {
    const listing = await browseDirectory();
    expect(listing.path).toBe(await realpath(homedir()));
  });

  test("parent is null at the filesystem root", async () => {
    const listing = await browseDirectory("/");
    expect(listing.parent).toBeNull();
  });

  test("rejects an invalid path the same way create does", async () => {
    await expect(browseDirectory("relative/dir")).rejects.toBeInstanceOf(InvalidProjectPathError);
    await expect(browseDirectory("/definitely/not/a/real/dir")).rejects.toBeInstanceOf(
      InvalidProjectPathError,
    );
  });
});

describe("createDirectory", () => {
  test("creates a subfolder and returns the parent's updated listing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "aven-mkdir-"));
    try {
      const listing = await createDirectory(dir, "new-folder");
      expect(listing.path).toBe(await realpath(dir));
      expect(listing.entries.map((entry) => entry.name)).toContain("new-folder");
      expect(listing.entries.find((entry) => entry.name === "new-folder")?.path).toBe(
        join(await realpath(dir), "new-folder"),
      );
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  test("rejects a name that is empty, '.', '..' or contains a path separator", async () => {
    const dir = await mkdtemp(join(tmpdir(), "aven-mkdir-"));
    try {
      await expect(createDirectory(dir, "")).rejects.toBeInstanceOf(InvalidFolderNameError);
      await expect(createDirectory(dir, ".")).rejects.toBeInstanceOf(InvalidFolderNameError);
      await expect(createDirectory(dir, "..")).rejects.toBeInstanceOf(InvalidFolderNameError);
      await expect(createDirectory(dir, "a/b")).rejects.toBeInstanceOf(InvalidFolderNameError);
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  test("rejects a folder that already exists", async () => {
    const dir = await mkdtemp(join(tmpdir(), "aven-mkdir-"));
    await mkdir(join(dir, "existing"));
    try {
      await expect(createDirectory(dir, "existing")).rejects.toBeInstanceOf(DirectoryExistsError);
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  test("rejects an invalid parent path", async () => {
    await expect(createDirectory("relative/dir", "x")).rejects.toBeInstanceOf(
      InvalidProjectPathError,
    );
  });
});
