import { afterAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { InvalidProjectPathError, resolveProjectPath, threadsService } from "./service";

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

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("threadsService (postgres)", async () => {
  const { db } = await import("@aven/db/client");
  const { users } = await import("@aven/db/schema/users");
  const { organizations } = await import("@aven/db/schema/organizations");
  const suffix = crypto.randomUUID().slice(0, 8);
  const userId = `u-${suffix}`;
  const orgA = `org-a-${suffix}`;
  const orgB = `org-b-${suffix}`;
  const dir = await mkdtemp(join(tmpdir(), "aven-threads-"));
  await mkdir(join(dir, "proj"));

  await db.insert(users).values({ id: userId, name: "T", email: `${userId}@aven.test` });
  await db.insert(organizations).values([
    { id: orgA, name: "A", slug: orgA },
    { id: orgB, name: "B", slug: orgB },
  ]);

  afterAll(async () => {
    // Cascades remove the threads.
    await db.delete(users).where((await import("drizzle-orm")).eq(users.id, userId));
    await db.delete(organizations).where((await import("drizzle-orm")).eq(organizations.id, orgA));
    await db.delete(organizations).where((await import("drizzle-orm")).eq(organizations.id, orgB));
    await rm(dir, { recursive: true });
  });

  test("creates a thread titled after the project folder and lists it", async () => {
    const thread = await threadsService.create(orgA, userId, { projectPath: join(dir, "proj") });
    expect(thread.title).toBe("proj");
    expect(thread.projectPath).toBe(await realpath(join(dir, "proj")));
    expect((await threadsService.list(orgA)).map((row) => row.id)).toContain(thread.id);
  });

  test("another organization cannot see, read or change the thread", async () => {
    const thread = await threadsService.create(orgA, userId, { projectPath: dir });
    expect(await threadsService.get(orgB, thread.id)).toBeNull();
    expect(await threadsService.update(orgB, thread.id, { title: "hijack" })).toBeNull();
    expect((await threadsService.list(orgB)).map((row) => row.id)).not.toContain(thread.id);
    expect((await threadsService.get(orgA, thread.id))?.title).not.toBe("hijack");
  });

  test("rejects an invalid project path without creating a thread", async () => {
    const before = (await threadsService.list(orgA)).length;
    await expect(
      threadsService.create(orgA, userId, { projectPath: join(dir, "missing") }),
    ).rejects.toBeInstanceOf(InvalidProjectPathError);
    expect((await threadsService.list(orgA)).length).toBe(before);
  });

  test("lists distinct recent paths", async () => {
    const paths = await threadsService.recentPaths(orgA);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths).toContain(await realpath(dir));
  });
});
