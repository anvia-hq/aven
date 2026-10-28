import { afterAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

import {
  DirectoryExistsError,
  DuplicateProjectPathError,
  InvalidFolderNameError,
  InvalidProjectPathError,
  projectsService,
  resolveProjectPath,
} from "./service";

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

describe("projectsService.browse", () => {
  test("lists only subdirectories, hides dot-directories and sorts case-insensitively", async () => {
    const dir = await mkdtemp(join(tmpdir(), "aven-browse-"));
    await mkdir(join(dir, "Banana"));
    await mkdir(join(dir, "apple"));
    await mkdir(join(dir, ".hidden"));
    await writeFile(join(dir, "file.txt"), "x");
    try {
      const listing = await projectsService.browse(dir);
      expect(listing.path).toBe(await realpath(dir));
      expect(listing.entries.map((entry) => entry.name)).toEqual(["apple", "Banana"]);
      expect(listing.entries[0]!.path).toBe(join(await realpath(dir), "apple"));
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  test("defaults to the home directory when no path is given", async () => {
    const listing = await projectsService.browse();
    expect(listing.path).toBe(await realpath(homedir()));
  });

  test("parent is null at the filesystem root", async () => {
    const listing = await projectsService.browse("/");
    expect(listing.parent).toBeNull();
  });

  test("rejects an invalid path the same way create does", async () => {
    await expect(projectsService.browse("relative/dir")).rejects.toBeInstanceOf(
      InvalidProjectPathError,
    );
    await expect(projectsService.browse("/definitely/not/a/real/dir")).rejects.toBeInstanceOf(
      InvalidProjectPathError,
    );
  });
});

describe("projectsService.createDirectory", () => {
  test("creates a subfolder and returns the parent's updated listing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "aven-mkdir-"));
    try {
      const listing = await projectsService.createDirectory(dir, "new-folder");
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
      await expect(projectsService.createDirectory(dir, "")).rejects.toBeInstanceOf(
        InvalidFolderNameError,
      );
      await expect(projectsService.createDirectory(dir, ".")).rejects.toBeInstanceOf(
        InvalidFolderNameError,
      );
      await expect(projectsService.createDirectory(dir, "..")).rejects.toBeInstanceOf(
        InvalidFolderNameError,
      );
      await expect(projectsService.createDirectory(dir, "a/b")).rejects.toBeInstanceOf(
        InvalidFolderNameError,
      );
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  test("rejects a folder that already exists", async () => {
    const dir = await mkdtemp(join(tmpdir(), "aven-mkdir-"));
    await mkdir(join(dir, "existing"));
    try {
      await expect(projectsService.createDirectory(dir, "existing")).rejects.toBeInstanceOf(
        DirectoryExistsError,
      );
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  test("rejects an invalid parent path", async () => {
    await expect(projectsService.createDirectory("relative/dir", "x")).rejects.toBeInstanceOf(
      InvalidProjectPathError,
    );
  });
});

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("projectsService (postgres)", async () => {
  const { seedOrgPair } = await import("../../test-support");
  const { userId, orgA, orgB, cleanup } = await seedOrgPair();
  const dir = await mkdtemp(join(tmpdir(), "aven-projects-"));

  afterAll(async () => {
    await cleanup();
    await rm(dir, { recursive: true });
  });

  test("creates a project and lists it", async () => {
    const project = await projectsService.create(orgA, userId, { name: "proj", projectPath: dir });
    expect(project.projectPath).toBe(await realpath(dir));
    expect((await projectsService.list(orgA)).map((row) => row.id)).toContain(project.id);
  });

  test("another organization cannot see or read the project", async () => {
    const project = await projectsService.create(orgA, userId, {
      name: "other",
      projectPath: await mkdtemp(join(tmpdir(), "aven-projects-")),
    });
    expect(await projectsService.get(orgB, project.id)).toBeNull();
    expect((await projectsService.list(orgB)).map((row) => row.id)).not.toContain(project.id);
  });

  test("rejects an invalid project path without creating a project", async () => {
    const before = (await projectsService.list(orgA)).length;
    await expect(
      projectsService.create(orgA, userId, { name: "nope", projectPath: join(dir, "missing") }),
    ).rejects.toBeInstanceOf(InvalidProjectPathError);
    expect((await projectsService.list(orgA)).length).toBe(before);
  });

  test("rejects a duplicate path within the same organization", async () => {
    const fresh = await mkdtemp(join(tmpdir(), "aven-projects-"));
    await projectsService.create(orgA, userId, { name: "first", projectPath: fresh });
    await expect(
      projectsService.create(orgA, userId, { name: "second", projectPath: fresh }),
    ).rejects.toBeInstanceOf(DuplicateProjectPathError);
    // Another organization can still use the same path.
    await expect(
      projectsService.create(orgB, userId, { name: "first", projectPath: fresh }),
    ).resolves.toBeDefined();
  });
});
