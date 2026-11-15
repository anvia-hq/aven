import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { db } from "@aven/db/client";
import { runtimes } from "@aven/db/schema/runtimes";
import { threads } from "@aven/db/schema/threads";
import { eq } from "drizzle-orm";

import { threadsService } from "../threads/service";
import { BoatApiError } from "./boat/client";
import { CLOUD_SANDBOX_LIFE_MS, createCloudExpiry } from "./cloud-expiry";
import { EXPIRED_COMPUTER, reachRunner } from "./providers";
import { CLOUD_RUNTIME_ID, runtimesService } from "./service";

const run = process.env.DATABASE_URL ? describe : describe.skip;
const HOUR_MS = 3_600_000;

run("Aven Cloud expiry (postgres)", async () => {
  const { seedOrgPair } = await import("../../testing/seed-org-pair");
  const { seedProject } = await import("../../testing/seed-project");
  const { userId, orgA, cleanup } = await seedOrgPair();
  const keptKey = process.env.AVEN_BOAT_API_KEY;
  const keptProvider = process.env.AVEN_CLOUD_PROVIDER;
  const [kept] = await db.select().from(runtimes).where(eq(runtimes.id, CLOUD_RUNTIME_ID));

  beforeAll(async () => {
    process.env.AVEN_BOAT_API_KEY = "boat_test_key_for_expiry";
    process.env.AVEN_CLOUD_PROVIDER = "boat";
    await runtimesService.ensureCloud();
  });

  afterAll(async () => {
    await cleanup();

    if (!kept) await db.delete(runtimes).where(eq(runtimes.id, CLOUD_RUNTIME_ID));

    if (keptKey === undefined) delete process.env.AVEN_BOAT_API_KEY;
    else process.env.AVEN_BOAT_API_KEY = keptKey;

    if (keptProvider === undefined) delete process.env.AVEN_CLOUD_PROVIDER;
    else process.env.AVEN_CLOUD_PROVIDER = keptProvider;
  });

  async function cloudThread(name: string, sandboxId: string | null) {
    const { project } = await seedProject(orgA, userId, null, name);
    const thread = await threadsService.create(orgA, userId, {
      projectId: project.id,
      runtimeId: CLOUD_RUNTIME_ID,
    });

    if (sandboxId)
      await db
        .update(runtimes)
        .set({ boatSandboxId: sandboxId })
        .where(eq(runtimes.id, thread.runtimeId));

    return thread;
  }

  async function backdate(thread: { id: string; runtimeId: string }, hours: number) {
    const then = new Date(Date.now() - hours * HOUR_MS);
    await db.update(runtimes).set({ createdAt: then }).where(eq(runtimes.id, thread.runtimeId));
    await db.update(threads).set({ updatedAt: then }).where(eq(threads.id, thread.id));
  }

  const revokedAt = async (id: string) =>
    (await db.select({ at: runtimes.revokedAt }).from(runtimes).where(eq(runtimes.id, id)))[0]!.at;

  test("deletes the sandbox of a thread idle for 48 hours and leaves the others", async () => {
    const stale = await cloudThread("stale", "bx_stale000");
    const fresh = await cloudThread("fresh", "bx_fresh000");
    const unused = await cloudThread("unused", null);
    await backdate(stale, 49);
    await backdate(unused, 72);
    await backdate(fresh, 47);
    const deleted: string[] = [];
    const expiry = createCloudExpiry({
      intervalMs: 60_000,
      client: {
        deleteSandbox: async (key, id) => {
          expect(key).toBe("boat_test_key_for_expiry");
          deleted.push(id);
          return {};
        },
      },
    });

    expect(CLOUD_SANDBOX_LIFE_MS).toBe(48 * HOUR_MS);
    expect(await expiry.sweep()).toBeGreaterThanOrEqual(2);
    expect(deleted).toContain("bx_stale000");
    expect(deleted).not.toContain("bx_fresh000");
    expect(await revokedAt(stale.runtimeId)).not.toBeNull();
    expect(await revokedAt(unused.runtimeId)).not.toBeNull();
    expect(await revokedAt(fresh.runtimeId)).toBeNull();
    expect(await runtimesService.providerOf(stale.runtimeId)).toBeUndefined();
    expect(await runtimesService.isExpiredCloud(stale.runtimeId)).toBe(true);
    expect(await runtimesService.isExpiredCloud(fresh.runtimeId)).toBe(false);
    await expect(
      reachRunner({ get: () => undefined }, { runtimeId: stale.runtimeId }),
    ).rejects.toThrow(EXPIRED_COMPUTER);
  });

  test("a sandbox boat no longer has is expired, and one it will not delete is tried again", async () => {
    const gone = await cloudThread("gone", "bx_gone0000");
    const stuck = await cloudThread("stuck", "bx_stuck000");
    await backdate(gone, 60);
    await backdate(stuck, 60);
    const expiry = createCloudExpiry({
      intervalMs: 60_000,
      client: {
        deleteSandbox: async (_key, id) => {
          if (id === "bx_gone0000") throw new BoatApiError(404, "not_found", "Gone");

          throw new BoatApiError(502, "bad_gateway", "Boat is down");
        },
      },
    });
    const warn = console.warn;
    console.warn = () => {};

    try {
      await expiry.sweep();
    } finally {
      console.warn = warn;
    }

    expect(await revokedAt(gone.runtimeId)).not.toBeNull();
    expect(await revokedAt(stuck.runtimeId)).toBeNull();
  });

  test("does nothing without a boat key", async () => {
    delete process.env.AVEN_BOAT_API_KEY;
    const stale = await cloudThread("no-key", "bx_nokey000").catch(() => undefined);

    expect(stale).toBeUndefined();
    process.env.AVEN_BOAT_API_KEY = "boat_test_key_for_expiry";
    expect(
      await createCloudExpiry({
        intervalMs: 60_000,
        client: { deleteSandbox: async () => ({}) },
      }).sweep(new Date(0)),
    ).toBe(0);
  });
});
