import { afterAll, describe, expect, test } from "bun:test";

import { db } from "@aven/db/client";
import { members } from "@aven/db/schema/members";
import { users } from "@aven/db/schema/users";
import { eq } from "drizzle-orm";

import { runtimesService } from "../runtimes/service";
import { threadMentionsService } from "./mentions";
import { threadsService } from "./service";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("threadMentionsService (postgres)", async () => {
  const { seedOrgPair } = await import("../../testing/seed-org-pair");
  const { userId, orgA, orgB, cleanup } = await seedOrgPair();
  const runner = (await runtimesService.create(orgA, userId, { name: "a" })).runtime;
  const { seedProject } = await import("../../testing/seed-project");
  const { project } = await seedProject(orgA, userId, runner.id, "proj");

  const mateId = `${userId}-mate`;
  await db.insert(users).values({ id: mateId, name: "Mate", email: `${mateId}@aven.test` });
  await db.insert(members).values([
    { id: `${userId}-m`, organizationId: orgA, userId, role: "owner" },
    { id: `${mateId}-m`, organizationId: orgA, userId: mateId, role: "member" },
  ]);
  const mention = (id: string, name: string) => `@[${name}](user:${id})`;

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, mateId));
    await cleanup();
  });

  test("keeps a mention for the one mentioned until they see the thread, and never for the author", async () => {
    const thread = await threadsService.create(orgA, userId, { projectId: project.id });
    await threadsService.update({ organizationId: orgA, userId }, thread.id, {
      visibility: "workspace",
    });
    await threadMentionsService.record(
      thread.id,
      mateId,
      `${mention(userId, "Owner")} is it ready? ${mention(mateId, "Mate")}`,
    );
    expect(await threadMentionsService.waiting(orgA, userId)).toEqual([thread.id]);
    expect(await threadMentionsService.waiting(orgA, mateId)).toEqual([]);

    await threadMentionsService.seen(userId, thread.id);
    expect(await threadMentionsService.waiting(orgA, userId)).toEqual([]);
  });

  test("ignores a mention of someone who does not exist, and says nothing of another workspace", async () => {
    const thread = await threadsService.create(orgA, userId, { projectId: project.id });
    await threadMentionsService.record(thread.id, mateId, mention("nobody-here", "Ghost"));
    expect(await threadMentionsService.waiting(orgA, userId)).toEqual([]);

    await threadMentionsService.record(thread.id, mateId, mention(userId, "Owner"));
    expect(await threadMentionsService.waiting(orgB, userId)).toEqual([]);
    expect(await threadMentionsService.waiting(orgA, userId)).toEqual([thread.id]);
  });

  test("a mention written again is still one", async () => {
    const thread = await threadsService.create(orgA, userId, { projectId: project.id });
    const text = mention(userId, "Owner");
    await threadMentionsService.record(thread.id, mateId, text);
    await threadMentionsService.record(thread.id, mateId, text);
    const waiting = await threadMentionsService.waiting(orgA, userId);
    expect(waiting.filter((id) => id === thread.id)).toHaveLength(1);
  });

  test("lists what was said and by whom, unread until seen, and unread again when mentioned again", async () => {
    const thread = await threadsService.create(orgA, userId, { projectId: project.id });
    await threadsService.update({ organizationId: orgA, userId }, thread.id, {
      visibility: "workspace",
    });
    await threadMentionsService.record(
      thread.id,
      mateId,
      `${mention(userId, "Owner")}   can you\nlook at this?`,
    );
    const [entry] = (await threadMentionsService.list(orgA, userId)).filter(
      (item) => item.threadId === thread.id,
    );
    expect(entry).toMatchObject({
      title: thread.title,
      authorName: "Mate",
      excerpt: "@Owner can you look at this?",
      read: false,
    });

    await threadMentionsService.seen(userId, thread.id);
    const seen = (await threadMentionsService.list(orgA, userId)).find(
      (item) => item.threadId === thread.id,
    );
    expect(seen?.read).toBe(true);

    await threadMentionsService.record(thread.id, mateId, mention(userId, "Owner"));
    const again = (await threadMentionsService.list(orgA, userId)).find(
      (item) => item.threadId === thread.id,
    );
    expect(again?.read).toBe(false);
  });

  test("marks every mention of the workspace read at once, and only that workspace's", async () => {
    const threadA = await threadsService.create(orgA, userId, { projectId: project.id });
    await threadMentionsService.record(threadA.id, mateId, mention(userId, "Owner"));
    expect(await threadMentionsService.waiting(orgA, userId)).toContain(threadA.id);

    await threadMentionsService.seenAll(orgB, userId);
    expect(await threadMentionsService.waiting(orgA, userId)).toContain(threadA.id);

    await threadMentionsService.seenAll(orgA, userId);
    expect(await threadMentionsService.waiting(orgA, userId)).toEqual([]);
    const listed = await threadMentionsService.list(orgA, userId);
    expect(listed.length).toBeGreaterThan(0);
    expect(listed.every((item) => item.read)).toBe(true);
  });
});
