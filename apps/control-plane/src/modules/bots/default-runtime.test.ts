import { describe, expect, test } from "bun:test";

import { db } from "@aven/db/client";
import { runtimes } from "@aven/db/schema/runtimes";
import { eq } from "drizzle-orm";

import { runtimesService } from "../runtimes/service";
import { registeredComputerOf } from "./default-runtime";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("the computer a bot defaults to (postgres)", async () => {
  const { seedOrgPair } = await import("../../testing/seed-org-pair");
  const { userId, orgA, cleanup } = await seedOrgPair();
  const { afterAll } = await import("bun:test");
  afterAll(cleanup);

  test("is none for someone with no registered computer, so the built-in runner serves", async () => {
    expect(await registeredComputerOf(userId, () => true)).toBeNull();
  });

  test("is the registered computer that is online, else the one seen last, never a revoked one", async () => {
    const first = (await runtimesService.create(orgA, userId, { name: "first" })).runtime;
    const second = (await runtimesService.create(orgA, userId, { name: "second" })).runtime;
    await db.update(runtimes).set({ lastSeenAt: new Date() }).where(eq(runtimes.id, second.id));
    expect(await registeredComputerOf(userId, () => false)).toBe(second.id);
    expect(await registeredComputerOf(userId, (id) => id === first.id)).toBe(first.id);
    await db.update(runtimes).set({ revokedAt: new Date() }).where(eq(runtimes.id, second.id));
    expect(await registeredComputerOf(userId, () => false)).toBe(first.id);
  });
});
