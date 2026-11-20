import { db } from "@aven/db/client";
import { cloudSandboxes } from "@aven/db/schema/cloud-sandboxes";
import { runtimes } from "@aven/db/schema/runtimes";
import type { CloudSandboxRow } from "@aven/db/schema/types";
import type { BoatMachineType, RuntimeProviderKind } from "@aven/protocol/types";
import { CLOUD_TEMPLATE_IDS } from "@aven/sandbox/cloud-config";
import {
  DEFAULT_MAX_DELETE_ATTEMPTS,
  DEFAULT_TRANSITION_WATCHDOG_MS,
  deleteRetryPlan,
} from "@aven/sandbox/lifecycle";
import { and, asc, eq, gt, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";

import type { FailedCloudDelete } from "./types";

export const cloudSandboxStore = {
  async ensure(input: {
    runtimeId: string;
    provider: RuntimeProviderKind;
    providerConfigId?: string | null;
    machineType?: BoatMachineType;
    externalId?: string | null;
  }) {
    const hasExternal = Boolean(input.externalId);
    const now = new Date();
    await db
      .insert(cloudSandboxes)
      .values({
        runtimeId: input.runtimeId,
        provider: input.provider,
        providerConfigId: input.providerConfigId ?? null,
        externalId: input.externalId ?? null,
        machineType: input.machineType ?? "default",
        state: hasExternal ? "stopped" : "absent",
        stoppedAt: hasExternal ? now : null,
        expiresAt: hasExternal ? new Date(now.getTime() + 48 * 3_600_000) : null,
        lastActivityAt: now,
      })
      .onConflictDoNothing();
  },

  async get(runtimeId: string): Promise<CloudSandboxRow | null> {
    const [row] = await db
      .select()
      .from(cloudSandboxes)
      .where(eq(cloudSandboxes.runtimeId, runtimeId));
    return row ?? null;
  },

  async setExternalId(runtimeId: string, externalId: string, providerConfigId?: string | null) {
    await db
      .update(cloudSandboxes)
      .set({
        externalId,
        providerConfigId: providerConfigId
          ? sql`coalesce(${cloudSandboxes.providerConfigId}, ${providerConfigId})`
          : sql`${cloudSandboxes.providerConfigId}`,
        version: sql`${cloudSandboxes.version} + 1`,
      })
      .where(eq(cloudSandboxes.runtimeId, runtimeId));
  },

  async markStarting(
    runtimeId: string,
    now = new Date(),
    watchdogMs = DEFAULT_TRANSITION_WATCHDOG_MS,
  ) {
    const expiresAt = new Date(now.getTime() + watchdogMs);
    await db
      .update(cloudSandboxes)
      .set({
        state: "starting",
        runningSince: sql`coalesce(${cloudSandboxes.runningSince}, ${now.toISOString()}::timestamptz)`,
        lastActivityAt: now,
        expiresAt,
        drainRequestedAt: null,
        nextRetryAt: null,
        lastError: null,
        version: sql`${cloudSandboxes.version} + 1`,
      })
      .where(eq(cloudSandboxes.runtimeId, runtimeId));
  },

  async markRunning(runtimeId: string, maxAgeMs: number, now = new Date()) {
    const [current] = await db
      .select({ runningSince: cloudSandboxes.runningSince })
      .from(cloudSandboxes)
      .where(eq(cloudSandboxes.runtimeId, runtimeId));
    const since = current?.runningSince ?? now;
    const expiresAt = new Date(since.getTime() + maxAgeMs);
    await db
      .update(cloudSandboxes)
      .set({
        state: "running",
        runningSince: since,
        lastActivityAt: now,
        stoppedAt: null,
        drainRequestedAt: null,
        expiresAt,
        deleteAttempts: 0,
        nextRetryAt: null,
        lastError: null,
        version: sql`${cloudSandboxes.version} + 1`,
      })
      .where(eq(cloudSandboxes.runtimeId, runtimeId));
  },

  async recordActivity(runtimeId: string, at: Date, dirty = false) {
    await db
      .update(cloudSandboxes)
      .set({
        lastActivityAt: sql`greatest(${cloudSandboxes.lastActivityAt}, ${at.toISOString()}::timestamptz)`,
        dirty: dirty ? true : sql`${cloudSandboxes.dirty}`,
      })
      .where(eq(cloudSandboxes.runtimeId, runtimeId));
  },

  async markExtended(runtimeId: string, now = new Date()) {
    await db
      .update(cloudSandboxes)
      .set({ lastExtendedAt: now })
      .where(eq(cloudSandboxes.runtimeId, runtimeId));
  },

  async markDraining(
    runtimeId: string,
    expectedVersion: number,
    deadlineAt: Date,
    now = new Date(),
  ) {
    const updated = await db
      .update(cloudSandboxes)
      .set({
        state: "draining",
        drainRequestedAt: now,
        expiresAt: deadlineAt,
        version: sql`${cloudSandboxes.version} + 1`,
      })
      .where(
        and(
          eq(cloudSandboxes.runtimeId, runtimeId),
          eq(cloudSandboxes.version, expectedVersion),
          eq(cloudSandboxes.state, "running"),
        ),
      )
      .returning({ runtimeId: cloudSandboxes.runtimeId });
    return updated.length > 0;
  },

  async markStopping(
    runtimeId: string,
    expectedVersion?: number,
    now = new Date(),
    watchdogMs = DEFAULT_TRANSITION_WATCHDOG_MS,
  ) {
    const condition =
      expectedVersion === undefined
        ? eq(cloudSandboxes.runtimeId, runtimeId)
        : and(eq(cloudSandboxes.runtimeId, runtimeId), eq(cloudSandboxes.version, expectedVersion));
    const updated = await db
      .update(cloudSandboxes)
      .set({
        state: "stopping",
        expiresAt: new Date(now.getTime() + watchdogMs),
        version: sql`${cloudSandboxes.version} + 1`,
      })
      .where(condition)
      .returning({ runtimeId: cloudSandboxes.runtimeId });
    return updated.length > 0;
  },

  async markStopped(
    runtimeId: string,
    expireMs: number,
    now = new Date(),
    snapshotName?: string | null,
  ) {
    const snapshotPatch =
      snapshotName === undefined ? {} : { runtimeSnapshotName: snapshotName, dirty: false };
    await db
      .update(cloudSandboxes)
      .set({
        state: "stopped",
        runningSince: null,
        drainRequestedAt: null,
        stoppedAt: now,
        expiresAt: new Date(now.getTime() + expireMs),
        lastError: null,
        version: sql`${cloudSandboxes.version} + 1`,
        ...snapshotPatch,
      })
      .where(eq(cloudSandboxes.runtimeId, runtimeId));
  },

  async markDeleting(
    runtimeId: string,
    expectedVersion?: number,
    now = new Date(),
    watchdogMs = DEFAULT_TRANSITION_WATCHDOG_MS,
  ) {
    const condition =
      expectedVersion === undefined
        ? eq(cloudSandboxes.runtimeId, runtimeId)
        : and(eq(cloudSandboxes.runtimeId, runtimeId), eq(cloudSandboxes.version, expectedVersion));
    const updated = await db
      .update(cloudSandboxes)
      .set({
        state: "deleting",
        expiresAt: new Date(now.getTime() + watchdogMs),
        version: sql`${cloudSandboxes.version} + 1`,
      })
      .where(condition)
      .returning({ runtimeId: cloudSandboxes.runtimeId });
    return updated.length > 0;
  },

  async markAbsent(runtimeId: string) {
    await db
      .update(cloudSandboxes)
      .set({
        state: "absent",
        providerConfigId: null,
        externalId: null,
        runtimeSnapshotName: null,
        dirty: false,
        runningSince: null,
        stoppedAt: null,
        drainRequestedAt: null,
        lastExtendedAt: null,
        expiresAt: null,
        deleteAttempts: 0,
        nextRetryAt: null,
        lastError: null,
        version: sql`${cloudSandboxes.version} + 1`,
      })
      .where(eq(cloudSandboxes.runtimeId, runtimeId));
  },

  async recordDeleteFailure(
    runtimeId: string,
    error: string,
    maxAttempts = DEFAULT_MAX_DELETE_ATTEMPTS,
    now = new Date(),
  ) {
    const [current] = await db
      .select({ deleteAttempts: cloudSandboxes.deleteAttempts })
      .from(cloudSandboxes)
      .where(eq(cloudSandboxes.runtimeId, runtimeId));
    const attempts = (current?.deleteAttempts ?? 0) + 1;
    const plan = deleteRetryPlan(attempts, now.getTime(), maxAttempts);
    await db
      .update(cloudSandboxes)
      .set({
        state: plan.giveUp ? "delete_failed" : "deleting",
        deleteAttempts: attempts,
        nextRetryAt: plan.nextRetryAt ? new Date(plan.nextRetryAt) : null,
        expiresAt: plan.nextRetryAt ? new Date(plan.nextRetryAt) : null,
        lastError: error.slice(0, 500),
        version: sql`${cloudSandboxes.version} + 1`,
      })
      .where(eq(cloudSandboxes.runtimeId, runtimeId));
    return plan;
  },

  async retryDelete(runtimeId: string, now = new Date()) {
    const updated = await db
      .update(cloudSandboxes)
      .set({
        state: "deleting",
        deleteAttempts: 0,
        nextRetryAt: now,
        expiresAt: new Date(now.getTime() + DEFAULT_TRANSITION_WATCHDOG_MS),
        lastError: null,
        version: sql`${cloudSandboxes.version} + 1`,
      })
      .where(
        and(eq(cloudSandboxes.runtimeId, runtimeId), eq(cloudSandboxes.state, "delete_failed")),
      )
      .returning({ runtimeId: cloudSandboxes.runtimeId });
    return updated.length > 0;
  },

  async failedDeletes(limit = 50): Promise<FailedCloudDelete[]> {
    const rows = await db
      .select({
        runtimeId: cloudSandboxes.runtimeId,
        provider: cloudSandboxes.provider,
        externalId: cloudSandboxes.externalId,
        deleteAttempts: cloudSandboxes.deleteAttempts,
        lastError: cloudSandboxes.lastError,
        updatedAt: cloudSandboxes.updatedAt,
      })
      .from(cloudSandboxes)
      .where(eq(cloudSandboxes.state, "delete_failed"))
      .orderBy(asc(cloudSandboxes.updatedAt))
      .limit(limit);
    return rows.map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() }));
  },

  async activePage({
    now = new Date(),
    drainingConfigIds = [],
    limit = 200,
    after,
  }: {
    now?: Date;
    drainingConfigIds?: string[];
    limit?: number;
    after?: string;
  }) {
    const dueStates = or(
      inArray(cloudSandboxes.state, ["running", "draining"]),
      and(
        inArray(cloudSandboxes.state, ["starting", "stopping"]),
        or(isNull(cloudSandboxes.expiresAt), lte(cloudSandboxes.expiresAt, now)),
      ),
      and(
        eq(cloudSandboxes.state, "stopped"),
        or(
          isNull(cloudSandboxes.expiresAt),
          lte(cloudSandboxes.expiresAt, now),
          drainingConfigIds.length > 0
            ? inArray(cloudSandboxes.providerConfigId, drainingConfigIds)
            : undefined,
        ),
      ),
      and(
        eq(cloudSandboxes.state, "deleting"),
        or(
          and(isNull(cloudSandboxes.nextRetryAt), lte(cloudSandboxes.expiresAt, now)),
          lte(cloudSandboxes.nextRetryAt, now),
        ),
      ),
    );
    return db
      .select()
      .from(cloudSandboxes)
      .where(and(dueStates, after === undefined ? undefined : gt(cloudSandboxes.runtimeId, after)))
      .orderBy(asc(cloudSandboxes.runtimeId))
      .limit(limit);
  },

  async remainingForConfig(configId: string) {
    const rows = await db
      .select({ runtimeId: cloudSandboxes.runtimeId })
      .from(cloudSandboxes)
      .where(and(eq(cloudSandboxes.providerConfigId, configId), ne(cloudSandboxes.state, "absent")))
      .limit(1);
    return rows.length;
  },

  async stoppedSince(since: Date) {
    return db
      .select({
        runtimeId: cloudSandboxes.runtimeId,
        providerConfigId: cloudSandboxes.providerConfigId,
        stoppedAt: cloudSandboxes.stoppedAt,
      })
      .from(cloudSandboxes)
      .where(
        and(
          eq(cloudSandboxes.state, "stopped"),
          or(isNull(cloudSandboxes.stoppedAt), gt(cloudSandboxes.stoppedAt, since)),
        ),
      );
  },

  async syncLegacyRuntimes(defaultExpireMs: number) {
    const missing = await db
      .select({
        id: runtimes.id,
        provider: runtimes.provider,
        sandboxId: runtimes.boatSandboxId,
        machineType: runtimes.boatMachineType,
        createdAt: runtimes.createdAt,
      })
      .from(runtimes)
      .leftJoin(cloudSandboxes, eq(cloudSandboxes.runtimeId, runtimes.id))
      .where(
        and(
          inArray(runtimes.parentRuntimeId, CLOUD_TEMPLATE_IDS),
          isNull(runtimes.revokedAt),
          isNull(cloudSandboxes.runtimeId),
        ),
      )
      .limit(500);

    for (const row of missing) {
      const hasBox = Boolean(row.sandboxId);
      await db
        .insert(cloudSandboxes)
        .values({
          runtimeId: row.id,
          provider: row.provider,
          externalId: row.sandboxId,
          machineType: row.machineType ?? "default",
          state: hasBox ? "stopped" : "absent",
          lastActivityAt: row.createdAt,
          stoppedAt: hasBox ? row.createdAt : null,
          expiresAt: hasBox ? new Date(row.createdAt.getTime() + defaultExpireMs) : null,
        })
        .onConflictDoNothing();
    }
  },
};
