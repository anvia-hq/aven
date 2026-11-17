import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { db } from "@aven/db/client";
import { runtimes } from "@aven/db/schema/runtimes";
import { threads } from "@aven/db/schema/threads";
import { eq } from "drizzle-orm";

import { threadsService } from "../threads/service";
import { BoatApiError } from "@aven/sandbox/boat/client";
import { CLOUD_SANDBOX_LIFE_MS, createCloudExpiry } from "./cloud-expiry";
import { EXPIRED_COMPUTER, reachRunner } from "./providers";
import { CLOUD_RUNTIME_ID, SPACES_RUNTIME_ID, runtimesService } from "./service";
import { clearSandboxPlatform, useSandboxPlatform } from "../../testing/sandbox-platform";

const run = process.env.DATABASE_URL ? describe : describe.skip;
const HOUR_MS = 3_600_000;

run("Aven Cloud expiry (postgres)", async () => {
  const { seedOrgPair } = await import("../../testing/seed-org-pair");
  const { seedProject } = await import("../../testing/seed-project");
  const { userId, orgA, cleanup } = await seedOrgPair();
  const [keptSpaces] = await db.select().from(runtimes).where(eq(runtimes.id, SPACES_RUNTIME_ID));
  const [kept] = await db.select().from(runtimes).where(eq(runtimes.id, CLOUD_RUNTIME_ID));

  beforeAll(async () => {
    await useSandboxPlatform("spaces");
    await useSandboxPlatform("boat", "boat_test_key_for_expiry");
  });

  afterAll(async () => {
    await cleanup();

    if (!kept) await db.delete(runtimes).where(eq(runtimes.id, CLOUD_RUNTIME_ID));

    if (!keptSpaces) await db.delete(runtimes).where(eq(runtimes.id, SPACES_RUNTIME_ID));

    clearSandboxPlatform();
  });

  async function cloudThread(name: string, sandboxId: string | null, template = CLOUD_RUNTIME_ID) {
    const { project } = await seedProject(orgA, userId, null, name);
    const thread = await threadsService.create(orgA, userId, {
      projectId: project.id,
      runtimeId: template,
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
      remove: {
        boat: async (id) => {
          deleted.push(id);
          return true;
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
      remove: {
        boat: async (id) => {
          if (id === "bx_gone0000") return true;

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

  test("deletes a spaces sandbox through spaces and a boat one through boat, each on its own", async () => {
    await useSandboxPlatform("spaces");
    const onSpaces = await cloudThread("on-spaces", "bx_spaces00", SPACES_RUNTIME_ID);
    await useSandboxPlatform("boat", "boat_test_key_for_expiry");
    const onBoat = await cloudThread("on-boat", "bx_boat0000");
    await backdate(onSpaces, 60);
    await backdate(onBoat, 60);
    const boat: string[] = [];
    const spaces: string[] = [];

    await createCloudExpiry({
      intervalMs: 60_000,
      remove: {
        boat: async (id) => {
          boat.push(id);
          return true;
        },
        spaces: async (id) => {
          spaces.push(id);
          return true;
        },
      },
    }).sweep();

    expect(spaces).toContain("bx_spaces00");
    expect(spaces).not.toContain("bx_boat0000");
    expect(boat).toContain("bx_boat0000");
    expect(boat).not.toContain("bx_spaces00");
    expect(await revokedAt(onSpaces.runtimeId)).not.toBeNull();
    expect(await revokedAt(onBoat.runtimeId)).not.toBeNull();
  });

  test("a spaces sandbox that cannot be deleted is tried again", async () => {
    await useSandboxPlatform("spaces");
    const stuck = await cloudThread("spaces-stuck", "bx_stuck000", SPACES_RUNTIME_ID);
    const fine = await cloudThread("spaces-fine", "bx_fine0000", SPACES_RUNTIME_ID);
    await backdate(stuck, 60);
    await backdate(fine, 60);
    const warn = console.warn;
    console.warn = () => {};

    try {
      await createCloudExpiry({
        intervalMs: 60_000,
        remove: {
          spaces: async (id) => {
            if (id === "bx_stuck000") throw new Error("spaces is down");

            return true;
          },
        },
      }).sweep();
    } finally {
      console.warn = warn;
      await useSandboxPlatform("boat", "boat_test_key_for_expiry");
    }

    expect(await revokedAt(stuck.runtimeId)).toBeNull();
    expect(await revokedAt(fine.runtimeId)).not.toBeNull();
  });

  test("does nothing without a sandbox platform", async () => {
    clearSandboxPlatform();
    const stale = await cloudThread("no-key", "bx_nokey000").catch(() => undefined);

    expect(stale).toBeUndefined();
    await useSandboxPlatform("boat", "boat_test_key_for_expiry");
    expect(
      await createCloudExpiry({
        intervalMs: 60_000,
        remove: { boat: async () => true },
      }).sweep(new Date(0)),
    ).toBe(0);
  });
});
