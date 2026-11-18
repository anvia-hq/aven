import { afterAll, describe, expect, test } from "bun:test";

import { db } from "@aven/db/client";
import { computerUsage } from "@aven/db/schema/computer-usage";
import { runtimes } from "@aven/db/schema/runtimes";
import { eq } from "drizzle-orm";

import { threadsService } from "../threads/service";
import { clearSandboxPlatform, useSandboxPlatform } from "../../testing/sandbox-platform";
import { computerUsageService } from "./computer-usage";
import { CLOUD_RUNTIME_ID } from "./service";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("recording when Aven Cloud computers run (real postgres)", async () => {
  const { seedOrgPair } = await import("../../testing/seed-org-pair");
  const { seedProject } = await import("../../testing/seed-project");
  const { userId, orgA, cleanup } = await seedOrgPair();
  const [kept] = await db.select().from(runtimes).where(eq(runtimes.id, CLOUD_RUNTIME_ID));

  await useSandboxPlatform("boat", "boat_test_key_for_usage");

  afterAll(async () => {
    await cleanup();

    if (!kept) await db.delete(runtimes).where(eq(runtimes.id, CLOUD_RUNTIME_ID));

    clearSandboxPlatform();
  });

  async function computer(name: string) {
    const { project } = await seedProject(orgA, userId, null, name);
    const thread = await threadsService.create(orgA, userId, {
      projectId: project.id,
      runtimeId: CLOUD_RUNTIME_ID,
    });
    const [row] = await db.select().from(runtimes).where(eq(runtimes.id, thread.runtimeId));
    return row!;
  }

  const rows = (runtimeId: string) =>
    db.select().from(computerUsage).where(eq(computerUsage.runtimeId, runtimeId));

  test("a computer running is one open interval, however often it reconnects, and stopping closes it", async () => {
    const first = await computer("usage-one");

    await computerUsageService.opened(first);
    await computerUsageService.opened(first);

    const open = await rows(first.id);
    expect(open).toHaveLength(1);
    expect(open[0]?.stoppedAt).toBeNull();
    expect(open[0]?.organizationId).toBe(orgA);
    expect(open[0]?.userId).toBe(userId);

    await computerUsageService.closed(first.id);
    await computerUsageService.opened(first);

    const all = await rows(first.id);
    expect(all).toHaveLength(2);
    expect(all.filter((row) => row.stoppedAt === null)).toHaveLength(1);
  });

  test("only Aven Cloud computers are recorded, and a workspace's running ones are counted", async () => {
    const before = await computerUsageService.runningIn(orgA);
    const cloud = await computer("usage-two");
    const [machine] = await db
      .insert(runtimes)
      .values({
        organizationId: orgA,
        ownerId: userId,
        name: "a machine",
        tokenHash: "x",
        tokenHint: "x",
      })
      .returning();

    await computerUsageService.opened(machine!);
    await computerUsageService.opened(cloud);

    expect(await rows(machine!.id)).toHaveLength(0);
    expect(await computerUsageService.runningIn(orgA)).toBe(before + 1);

    await computerUsageService.closeAll();

    expect(await computerUsageService.runningIn(orgA)).toBe(0);
  });
});
