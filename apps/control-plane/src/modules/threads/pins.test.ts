import { afterAll, describe, expect, test } from "bun:test";

import { db } from "@aven/db/client";
import { members } from "@aven/db/schema/members";
import { users } from "@aven/db/schema/users";
import { eq } from "drizzle-orm";

import { runtimesService } from "../runtimes/service";
import { threadPinsService } from "./pins";
import { threadsService } from "./service";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("threadPinsService (postgres)", async () => {
  const { seedOrgPair } = await import("../../testing/seed-org-pair");
  const { userId, orgA, cleanup } = await seedOrgPair();
  const runner = (await runtimesService.create(orgA, userId, { name: "a" })).runtime;
  const { seedProject } = await import("../../testing/seed-project");
  const { project } = await seedProject(orgA, userId, runner.id, "proj");

  const mateId = `${userId}-mate`;
  await db.insert(users).values({ id: mateId, name: "Mate", email: `${mateId}@aven.test` });
  await db
    .insert(members)
    .values({ id: `${mateId}-m`, organizationId: orgA, userId: mateId, role: "member" });

  const owned = (id: string) => threadsService.owned({ organizationId: orgA, userId }, id);

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, mateId));
    await cleanup();
  });

  test("keeps one pin per person, and pinning again keeps the first time", async () => {
    const thread = await threadsService.create(orgA, userId, { projectId: project.id });
    const first = await threadPinsService.pin(userId, thread.id);
    const second = await threadPinsService.pin(userId, thread.id);
    expect(second.pinnedAt).toEqual(first.pinnedAt);
    expect(await threadPinsService.pinnedAt(userId, thread.id)).toEqual(first.pinnedAt);
    expect(await threadPinsService.pinnedAt(mateId, thread.id)).toBeNull();
  });

  test("unpinning removes the pin and can be repeated", async () => {
    const thread = await threadsService.create(orgA, userId, { projectId: project.id });
    await threadPinsService.pin(userId, thread.id);
    expect(await threadPinsService.unpin(userId, thread.id)).toEqual({ pinnedAt: null });
    expect(await threadPinsService.unpin(userId, thread.id)).toEqual({ pinnedAt: null });
    expect(await threadPinsService.pinnedAt(userId, thread.id)).toBeNull();
  });

  test("pinning does not touch the thread's updated_at", async () => {
    const thread = await threadsService.create(orgA, userId, { projectId: project.id });
    const before = (await owned(thread.id)).updatedAt;
    await threadPinsService.pin(userId, thread.id);
    expect((await owned(thread.id)).updatedAt).toEqual(before);
  });

  test("the thread list carries the viewer's pin and not a teammate's", async () => {
    const thread = await threadsService.create(orgA, userId, { projectId: project.id });
    await threadsService.update({ organizationId: orgA, userId }, thread.id, {
      visibility: "workspace",
    });
    const { pinnedAt } = await threadPinsService.pin(userId, thread.id);
    const mine = (await threadsService.list({ organizationId: orgA, userId })).find(
      (row) => row.id === thread.id,
    );
    const mate = (await threadsService.list({ organizationId: orgA, userId: mateId })).find(
      (row) => row.id === thread.id,
    );
    expect(mine?.pinnedAt).toEqual(pinnedAt);
    expect(mate?.pinnedAt).toBeNull();
  });

  test("a pin survives the thread being archived and reopened", async () => {
    const thread = await threadsService.create(orgA, userId, { projectId: project.id });
    const { pinnedAt } = await threadPinsService.pin(userId, thread.id);
    await threadsService.update({ organizationId: orgA, userId }, thread.id, { state: "archived" });
    await threadsService.update({ organizationId: orgA, userId }, thread.id, { state: "open" });
    expect(await threadPinsService.pinnedAt(userId, thread.id)).toEqual(pinnedAt);
  });
});
