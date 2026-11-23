import { afterAll, describe, expect, test } from "bun:test";

import { db } from "@aven/db/client";
import { cloudSandboxes } from "@aven/db/schema/cloud-sandboxes";
import { runtimes } from "@aven/db/schema/runtimes";
import { eq } from "drizzle-orm";

import { seedOrgPair } from "../../testing/seed-org-pair";
import { runtimesService } from "../runtimes/service";
import { cloudSandboxStore } from "./sandbox-store";

const run = process.env.DATABASE_URL ? describe : describe.skip;
const HOUR_MS = 3_600_000;

run("cloudSandboxStore lifecycle state guards (real postgres)", async () => {
  const seed = await seedOrgPair();
  afterAll(() => seed.cleanup());

  async function makeRuntime(boatSandboxId?: string) {
    const { runtime } = await runtimesService.create(seed.orgA, seed.userId, { name: "Spaces" });

    if (boatSandboxId) {
      await db.update(runtimes).set({ boatSandboxId }).where(eq(runtimes.id, runtime.id));
    }

    return runtime.id;
  }

  test("markStopped does not extend expiry on already-stopped rows or revive deleting rows", async () => {
    const runtimeId = await makeRuntime("bx_stopped_guard");
    const t0 = new Date("2026-11-20T00:00:00.000Z");
    const t1 = new Date("2026-11-21T00:00:00.000Z");

    await cloudSandboxStore.ensure({
      runtimeId,
      provider: "spaces",
      externalId: "bx_stopped_guard",
    });
    await cloudSandboxStore.markRunning(runtimeId, 12 * HOUR_MS, t0);
    await cloudSandboxStore.markStopped(runtimeId, 48 * HOUR_MS, t0);

    const afterStop = await cloudSandboxStore.get(runtimeId);
    expect(afterStop?.state).toBe("stopped");
    expect(afterStop?.stoppedAt?.toISOString()).toBe(t0.toISOString());
    expect(afterStop?.expiresAt?.toISOString()).toBe(
      new Date(t0.getTime() + 48 * HOUR_MS).toISOString(),
    );

    await cloudSandboxStore.markStopped(runtimeId, 48 * HOUR_MS, t1);
    const afterSecondStop = await cloudSandboxStore.get(runtimeId);
    expect(afterSecondStop?.stoppedAt?.toISOString()).toBe(t0.toISOString());
    expect(afterSecondStop?.expiresAt?.toISOString()).toBe(
      new Date(t0.getTime() + 48 * HOUR_MS).toISOString(),
    );

    await cloudSandboxStore.markDeleting(runtimeId, afterSecondStop?.version, t1);
    await cloudSandboxStore.markStopped(runtimeId, 48 * HOUR_MS, t1);
    const afterStopWhileDeleting = await cloudSandboxStore.get(runtimeId);
    expect(afterStopWhileDeleting?.state).toBe("deleting");
  });

  test("markStopped still records a snapshot name when the row just transitioned to stopped", async () => {
    const runtimeId = await makeRuntime("bx_snapshot_guard");
    const t0 = new Date("2026-11-20T00:00:00.000Z");

    await cloudSandboxStore.ensure({
      runtimeId,
      provider: "lizard",
      externalId: "bx_snapshot_guard",
    });
    await cloudSandboxStore.markStopping(runtimeId, undefined, t0);
    await cloudSandboxStore.markStopped(runtimeId, 48 * HOUR_MS, t0);
    await cloudSandboxStore.markStopped(runtimeId, 48 * HOUR_MS, t0, "aven-rt-snap");

    const row = await cloudSandboxStore.get(runtimeId);
    expect(row?.state).toBe("stopped");
    expect(row?.runtimeSnapshotName).toBe("aven-rt-snap");
    expect(row?.dirty).toBe(false);
  });

  test("revertStarting returns failed starts to absent or stopped without extending stoppedAt", async () => {
    const freshId = await makeRuntime();
    const t0 = new Date("2026-11-20T00:00:00.000Z");
    const t1 = new Date("2026-11-20T05:00:00.000Z");

    await cloudSandboxStore.ensure({ runtimeId: freshId, provider: "spaces" });
    await cloudSandboxStore.markStarting(freshId, t0);
    await cloudSandboxStore.revertStarting(freshId, 48 * HOUR_MS, t0);

    const freshRow = await cloudSandboxStore.get(freshId);
    expect(freshRow?.state).toBe("absent");
    expect(freshRow?.expiresAt).toBeNull();

    const wakingId = await makeRuntime("bx_wake_fail");
    await cloudSandboxStore.ensure({
      runtimeId: wakingId,
      provider: "spaces",
      externalId: "bx_wake_fail",
    });
    await cloudSandboxStore.markRunning(wakingId, 12 * HOUR_MS, t0);
    await cloudSandboxStore.markStopped(wakingId, 48 * HOUR_MS, t0);
    await cloudSandboxStore.markStarting(wakingId, t1);
    await cloudSandboxStore.revertStarting(wakingId, 48 * HOUR_MS, t1);

    const wakingRow = await cloudSandboxStore.get(wakingId);
    expect(wakingRow?.state).toBe("stopped");
    expect(wakingRow?.stoppedAt?.toISOString()).toBe(t0.toISOString());
    expect(wakingRow?.expiresAt?.toISOString()).toBe(
      new Date(t0.getTime() + 48 * HOUR_MS).toISOString(),
    );
  });

  test("expireStoppedNow marks a stopped sandbox immediately due for deletion", async () => {
    const runtimeId = await makeRuntime("bx_expire_now");
    const t0 = new Date("2026-11-20T00:00:00.000Z");
    const t1 = new Date("2026-11-20T01:00:00.000Z");

    await cloudSandboxStore.ensure({ runtimeId, provider: "spaces", externalId: "bx_expire_now" });
    await cloudSandboxStore.markRunning(runtimeId, 12 * HOUR_MS, t0);
    await cloudSandboxStore.markStopped(runtimeId, 48 * HOUR_MS, t0);
    await cloudSandboxStore.expireStoppedNow(runtimeId, t1);

    const row = await cloudSandboxStore.get(runtimeId);
    expect(row?.state).toBe("stopped");
    expect(row?.expiresAt?.toISOString()).toBe(t1.toISOString());
  });

  test("syncLegacyRuntimes repairs drifted rows whose external_id was cleared while boat_sandbox_id remains", async () => {
    const runtimeId = await makeRuntime("bx_drifted");
    await cloudSandboxStore.ensure({ runtimeId, provider: "spaces", externalId: "bx_drifted" });
    await db
      .update(cloudSandboxes)
      .set({ externalId: null })
      .where(eq(cloudSandboxes.runtimeId, runtimeId));

    await cloudSandboxStore.syncLegacyRuntimes(48 * HOUR_MS);

    const repaired = await cloudSandboxStore.get(runtimeId);
    expect(repaired?.externalId).toBe("bx_drifted");
  });
});
