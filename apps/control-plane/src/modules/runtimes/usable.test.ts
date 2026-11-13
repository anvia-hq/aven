import { afterAll, describe, expect, test } from "bun:test";

import { db } from "@aven/db/client";
import { members } from "@aven/db/schema/members";
import { runtimes } from "@aven/db/schema/runtimes";
import { users } from "@aven/db/schema/users";
import { eq } from "drizzle-orm";

import { seedOrgPair } from "../../testing/seed-org-pair";
import { LOCAL_RUNTIME_ID, runtimesService } from "./service";
import { requireUsableRuntime } from "./usable";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("requireUsableRuntime (real postgres)", async () => {
  const seed = await seedOrgPair();
  const other = `${seed.userId}-other`;
  await db.insert(users).values({ id: other, name: "O", email: `${other}@aven.test` });
  afterAll(async () => {
    await seed.cleanup();
    await db.delete(users).where(eq(users.id, other));
  });

  const make = async (values: Partial<typeof runtimes.$inferInsert>) => {
    const [row] = await db
      .insert(runtimes)
      .values({
        name: "r",
        tokenHash: crypto.randomUUID(),
        tokenHint: "abcd",
        ...values,
      })
      .returning();
    return row!.id;
  };

  test("the built-in runner, a host runner of one's own and a shared runner of one's workspace are usable", async () => {
    await db.insert(members).values({
      id: crypto.randomUUID(),
      organizationId: seed.orgA,
      userId: seed.userId,
      role: "member",
    });
    const own = await make({ host: true, ownerId: seed.userId, organizationId: seed.orgA });
    const shared = await make({ organizationId: seed.orgA });
    await runtimesService.ensureLocal();
    await requireUsableRuntime(seed.userId, LOCAL_RUNTIME_ID);
    await requireUsableRuntime(seed.userId, own);
    await requireUsableRuntime(seed.userId, shared);
  });

  test("another person's host runner, another workspace's runner and a revoked or missing one are refused", async () => {
    const theirs = await make({ host: true, ownerId: other, organizationId: seed.orgA });
    const elsewhere = await make({ organizationId: seed.orgB });
    const revoked = await make({
      host: true,
      ownerId: seed.userId,
      organizationId: seed.orgA,
      revokedAt: new Date(),
    });
    for (const id of [theirs, elsewhere, revoked, crypto.randomUUID()]) {
      await expect(requireUsableRuntime(seed.userId, id)).rejects.toThrow("not one you can use");
    }
  });
  test("a runner's GitHub mode is machine by default, can be changed, and a temporary runner is always person", async () => {
    const own = await make({ host: true, ownerId: seed.userId, organizationId: seed.orgA });
    expect(await runtimesService.githubModeOf(own)).toBe("machine");

    const changed = await runtimesService.setGithubMode(seed.orgA, own, "person");
    expect(changed?.githubMode).toBe("person");
    expect(await runtimesService.githubModeOf(own)).toBe("person");

    const temporary = await make({
      host: true,
      ownerId: seed.userId,
      organizationId: seed.orgA,
      lifetime: "ephemeral",
    });
    expect(await runtimesService.githubModeOf(temporary)).toBe("person");
    expect((await runtimesService.get(seed.orgA, temporary))?.githubMode).toBe("person");
    await expect(runtimesService.setGithubMode(seed.orgA, temporary, "machine")).rejects.toThrow(
      "temporary runner",
    );
  });
});
