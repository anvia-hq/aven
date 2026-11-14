import { afterAll, describe, expect, test } from "bun:test";

import { db } from "@aven/db/client";
import { members } from "@aven/db/schema/members";
import { users } from "@aven/db/schema/users";
import { eq } from "drizzle-orm";

import { decisionModelService } from "../decision-model/service";
import { runtimesService } from "../runtimes/service";
import { ThreadNotFoundError, threadsService } from "../threads/service";
import { FolderNotFoundError, foldersService } from "./service";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("foldersService (postgres)", async () => {
  const { seedOrgPair } = await import("../../testing/seed-org-pair");
  const { seedProject } = await import("../../testing/seed-project");
  const { userId, orgA, cleanup } = await seedOrgPair();
  await decisionModelService.save(orgA, { kind: "jev", apiKey: "test-key-0000" });
  const runner = (await runtimesService.create(orgA, userId, { name: "a" })).runtime;
  const { project } = await seedProject(orgA, userId, runner.id, "folders");
  const strangerId = `${userId}-stranger`;
  await db
    .insert(users)
    .values({ id: strangerId, name: "Stranger", email: `${strangerId}@aven.test` });
  await db
    .insert(members)
    .values({ id: `${userId}-m`, organizationId: orgA, userId, role: "owner" });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, strangerId));
    await cleanup();
  });

  const newThread = () => threadsService.create(orgA, userId, { projectId: project.id });

  test("creates folders open and empty, newest first, and renames and closes them", async () => {
    const first = await foldersService.create(userId, "First");
    const second = await foldersService.create(userId, "Second");
    expect(first).toMatchObject({ name: "First", open: true, threadIds: [] });
    const listed = await foldersService.list(userId);
    expect(listed.map((folder) => folder.name)).toEqual(["Second", "First"]);
    expect(await foldersService.update(userId, first.id, { name: "Renamed" })).toMatchObject({
      name: "Renamed",
      open: true,
    });
    expect(await foldersService.update(userId, second.id, { open: false })).toMatchObject({
      name: "Second",
      open: false,
    });
    await foldersService.remove(userId, first.id);
    await foldersService.remove(userId, second.id);
  });

  test("a thread is in at most one folder, and moves between them and out", async () => {
    const a = await foldersService.create(userId, "A");
    const b = await foldersService.create(userId, "B");
    const thread = await newThread();
    await foldersService.moveThread(userId, thread.id, a.id);
    await foldersService.moveThread(userId, thread.id, b.id);
    const listed = await foldersService.list(userId);
    expect(listed.find((folder) => folder.id === a.id)?.threadIds).toEqual([]);
    expect(listed.find((folder) => folder.id === b.id)?.threadIds).toEqual([thread.id]);
    await foldersService.moveThread(userId, thread.id, null);
    expect((await foldersService.list(userId)).flatMap((folder) => folder.threadIds)).toEqual([]);
    await foldersService.remove(userId, a.id);
    await foldersService.remove(userId, b.id);
  });

  test("deleting a folder unfiles its threads and keeps them", async () => {
    const folder = await foldersService.create(userId, "Gone");
    const thread = await newThread();
    await foldersService.moveThread(userId, thread.id, folder.id);
    await foldersService.remove(userId, folder.id);
    expect(await foldersService.list(userId)).toEqual([]);
    expect((await threadsService.readableForPerson(userId, thread.id)).id).toBe(thread.id);
  });

  test("another person sees none of it and cannot change it", async () => {
    const folder = await foldersService.create(userId, "Mine");
    const thread = await newThread();
    await foldersService.moveThread(userId, thread.id, folder.id);
    expect(await foldersService.list(strangerId)).toEqual([]);
    await expect(
      foldersService.update(strangerId, folder.id, { name: "x" }),
    ).rejects.toBeInstanceOf(FolderNotFoundError);
    await expect(foldersService.remove(strangerId, folder.id)).rejects.toBeInstanceOf(
      FolderNotFoundError,
    );
    await expect(
      foldersService.moveThread(strangerId, thread.id, folder.id),
    ).rejects.toBeInstanceOf(FolderNotFoundError);
    await foldersService.remove(userId, folder.id);
  });

  test("a thread the person cannot read cannot be filed", async () => {
    const own = await foldersService.create(strangerId, "Theirs");
    const thread = await newThread();
    await expect(foldersService.moveThread(strangerId, thread.id, own.id)).rejects.toBeInstanceOf(
      ThreadNotFoundError,
    );
    expect((await foldersService.list(strangerId)).flatMap((folder) => folder.threadIds)).toEqual(
      [],
    );
    await foldersService.remove(strangerId, own.id);
  });
});
