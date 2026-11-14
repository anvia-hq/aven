import { afterAll, describe, expect, test } from "bun:test";

import { db } from "@aven/db/client";
import { threads } from "@aven/db/schema/threads";
import { eq, inArray } from "drizzle-orm";

import { runtimesService } from "../runtimes/service";
import { createThreadRetention } from "./retention";
import { threadsService } from "./service";
import type { StaleThread } from "./types";

const run = process.env.DATABASE_URL ? describe : describe.skip;
const DAY_MS = 86_400_000;
const NOW = new Date();
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY_MS);

run("createThreadRetention (postgres)", async () => {
  const { seedOrgPair } = await import("../../testing/seed-org-pair");
  const { userId, orgA, cleanup } = await seedOrgPair();
  const runner = (await runtimesService.create(orgA, userId, { name: "a" })).runtime;
  const { seedProject } = await import("../../testing/seed-project");
  const { project } = await seedProject(orgA, userId, runner.id, "proj");

  afterAll(cleanup);

  async function threadAged(days: number, changes: Partial<typeof threads.$inferInsert> = {}) {
    const thread = await threadsService.create(orgA, userId, { projectId: project.id });
    await db
      .update(threads)
      .set({ updatedAt: daysAgo(days), ...changes })
      .where(eq(threads.id, thread.id));
    return thread.id;
  }

  const stateOf = async (id: string) =>
    (await db.select({ state: threads.state }).from(threads).where(eq(threads.id, id)))[0]?.state;

  function retention(mine: string[], options: { running?: string[]; failing?: string[] } = {}) {
    const putAway: string[] = [];
    const job = createThreadRetention({
      archive: async ({ id, organizationId, createdBy, runtimeId }: StaleThread) => {
        if (!mine.includes(id)) return;

        if (options.failing?.includes(id)) throw new Error("could not archive");

        await threadsService.update({ organizationId, userId: createdBy }, id, {
          state: "archived",
        });
        putAway.push(`${id}@${runtimeId}`);
      },
      isRunning: (id) => options.running?.includes(id) ?? false,
      intervalMs: 60_000,
      limit: 5000,
    });
    return { job, putAway };
  }

  test("archives an open thread with no activity for 30 days, and frees its sandbox, and leaves a newer one open", async () => {
    const stale = await threadAged(31);
    const recent = await threadAged(29);
    const { job, putAway } = retention([stale, recent]);

    await job.sweep(NOW);

    expect(await stateOf(stale)).toBe("archived");
    expect(await stateOf(recent)).toBe("open");
    expect(putAway).toEqual([`${stale}@${runner.id}`]);
  });

  test("leaves alone a stale thread that is snoozed, waiting for an answer, or running", async () => {
    const snoozed = await threadAged(60, { state: "snoozed" });
    const asking = await threadAged(60, { pendingContinuation: { waiting: true } });
    const running = await threadAged(60);
    const { job } = retention([snoozed, asking, running], { running: [running] });

    await job.sweep(NOW);

    expect(await stateOf(snoozed)).toBe("snoozed");
    expect(await stateOf(asking)).toBe("open");
    expect(await stateOf(running)).toBe("open");
  });

  test("one thread that cannot be archived does not stop the others, and a thread already archived is not swept again", async () => {
    const stuck = await threadAged(45);
    const fine = await threadAged(45);
    const { job } = retention([stuck, fine], { failing: [stuck] });

    await job.sweep(NOW);

    expect(await stateOf(stuck)).toBe("open");
    expect(await stateOf(fine)).toBe("archived");

    const again = retention([stuck, fine]);
    await again.job.sweep(NOW);
    expect(again.putAway).toEqual([`${stuck}@${runner.id}`]);

    await db.delete(threads).where(inArray(threads.id, [stuck, fine]));
  });
});
