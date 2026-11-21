import { db } from "@aven/db/client";
import { runtimes } from "@aven/db/schema/runtimes";
import { threads } from "@aven/db/schema/threads";
import type { CloudSandboxRow } from "@aven/db/schema/types";
import type { RunDrainReason } from "@aven/protocol/types";
import { cloudProvider, isCloudProvider } from "@aven/sandbox/cloud-config";
import {
  decideSandboxAction,
  effectiveIdleWindows,
  runtimeSnapshotName,
} from "@aven/sandbox/lifecycle";
import type { LifecyclePolicy, ProviderCredentials } from "@aven/sandbox/types";
import { describeError } from "@aven/server-kit/errors";
import { createPoller } from "@aven/server-kit/poller";
import { and, eq, inArray, ne } from "drizzle-orm";

import { cloudSettingsService } from "../cloud-settings/service";
import { environmentsService } from "../environments/service";
import { runtimeActivity } from "../runtimes/activity";
import { computerUsageService } from "../runtimes/computer-usage";
import type { RuntimeHub } from "../runtimes/hub";
import { extendCloudRuntime, stopCloudRuntime } from "../runtimes/providers";
import { cloudSandboxStore } from "./sandbox-store";
import { cloudLifecycleService } from "./service";
import { spendBrakeService } from "./spend";

const SANDBOX_PAGE = 200;

type ReconcilerOptions = {
  intervalMs: number;
  hub: Pick<RuntimeHub, "get" | "drainRuntime" | "cancelRuntime">;
  running: (threadId: string) => boolean;
  lastEventAt: (threadId: string) => number | undefined;
  pageSize?: number;
  now?: () => number;
};

type ThreadTiming = {
  threadId: string;
  updatedAt: Date;
};

async function threadsByRuntime(runtimeIds: string[]) {
  const grouped = new Map<string, ThreadTiming[]>();

  if (runtimeIds.length === 0) return grouped;

  const rows = await db
    .select({
      runtimeId: threads.runtimeId,
      threadId: threads.id,
      updatedAt: threads.updatedAt,
    })
    .from(threads)
    .where(and(inArray(threads.runtimeId, runtimeIds), ne(threads.state, "archived")));

  for (const row of rows) {
    const list = grouped.get(row.runtimeId);

    if (list) list.push({ threadId: row.threadId, updatedAt: row.updatedAt });
    else grouped.set(row.runtimeId, [{ threadId: row.threadId, updatedAt: row.updatedAt }]);
  }

  return grouped;
}

export function createCloudReconciler({
  intervalMs,
  hub,
  running,
  lastEventAt,
  pageSize = SANDBOX_PAGE,
  now = Date.now,
}: ReconcilerOptions) {
  async function credentialsFor(row: CloudSandboxRow): Promise<ProviderCredentials | undefined> {
    if (!row.providerConfigId) return undefined;

    return (await cloudSettingsService.credentialsFor(row.providerConfigId)) ?? undefined;
  }

  async function snapshotBeforeStop(
    row: CloudSandboxRow,
    credentials: ProviderCredentials | undefined,
  ): Promise<string | null | undefined> {
    if (!isCloudProvider(row.provider) || !row.externalId) return undefined;

    const module = cloudProvider(row.provider);

    if (module.capabilities.stopMode !== "snapshot_on_stop" || !row.dirty) return undefined;

    const name = row.runtimeSnapshotName ?? runtimeSnapshotName(row.runtimeId);
    const saved = await module.saveEnvironment(row.externalId, name, credentials);
    return saved.status === "failed" ? undefined : saved.name;
  }

  async function stopRow(row: CloudSandboxRow, policy: LifecyclePolicy, at: Date, reason: string) {
    const claimed = await cloudSandboxStore.markStopping(
      row.runtimeId,
      row.version,
      at,
      policy.transitionWatchdogMs,
    );

    if (!claimed) return false;

    hub.cancelRuntime(row.runtimeId, reason);
    const credentials = await credentialsFor(row);

    try {
      const snapshotName = await snapshotBeforeStop(row, credentials);
      await stopCloudRuntime(row.runtimeId, credentials);
      await cloudSandboxStore.markStopped(row.runtimeId, policy.expireMs, at, snapshotName);
      await computerUsageService.closed(row.runtimeId);
      runtimeActivity.forget(row.runtimeId);
      return true;
    } catch (error) {
      console.warn(
        `Could not stop the Aven Cloud computer ${row.runtimeId} (${reason}):`,
        describeError(error),
      );
      return false;
    }
  }

  async function deleteRow(row: CloudSandboxRow, policy: LifecyclePolicy, at: Date) {
    if (row.state !== "deleting") {
      const claimed = await cloudSandboxStore.markDeleting(
        row.runtimeId,
        row.version,
        at,
        policy.transitionWatchdogMs,
      );

      if (!claimed) return false;
    }

    const credentials = await credentialsFor(row);

    try {
      if (isCloudProvider(row.provider)) {
        const module = cloudProvider(row.provider);

        if (row.externalId) {
          const removed = await module.removeSandbox(row.externalId, credentials);

          if (!removed) throw new Error("Provider credentials unavailable to remove sandbox");
        }

        if (row.runtimeSnapshotName) {
          const removedSnap = await module.removeEnvironment(row.runtimeSnapshotName, credentials);

          if (!removedSnap) throw new Error("Provider credentials unavailable to remove snapshot");
        }
      }

      await db.update(runtimes).set({ boatSandboxId: null }).where(eq(runtimes.id, row.runtimeId));
      await cloudSandboxStore.markAbsent(row.runtimeId);
      await computerUsageService.closed(row.runtimeId);
      runtimeActivity.forget(row.runtimeId);
      return true;
    } catch (error) {
      const message = describeError(error);
      await cloudSandboxStore.recordDeleteFailure(
        row.runtimeId,
        message,
        policy.maxDeleteAttempts,
        at,
      );
      console.warn(`Could not delete the Aven Cloud computer ${row.runtimeId}:`, message);
      return false;
    }
  }

  async function reconcileStuck(
    row: CloudSandboxRow,
    state: "starting" | "stopping" | "deleting",
    policy: LifecyclePolicy,
    at: Date,
  ) {
    if (state === "starting") {
      if (hub.get(row.runtimeId)) {
        await cloudSandboxStore.markRunning(row.runtimeId, policy.maxAgeMs, at);
        return;
      }

      if (row.externalId) {
        await stopRow(row, policy, at, "Recovered a sandbox that stalled while starting");
        return;
      }

      await cloudSandboxStore.markAbsent(row.runtimeId);
      return;
    }

    if (state === "stopping") {
      await stopRow(row, policy, at, "Retrying a stalled sandbox stop");
      return;
    }

    await deleteRow(row, policy, at);
  }

  async function visit(
    row: CloudSandboxRow,
    threadRows: ThreadTiming[],
    policy: LifecyclePolicy,
    atMs: number,
    drainingSet: ReadonlySet<string>,
    budgetExceeded: boolean,
  ) {
    const at = new Date(atMs);
    const agentRunning = threadRows.some((thread) => running(thread.threadId));
    const lastAgentAt = threadRows.reduce(
      (latest, thread) =>
        Math.max(latest, thread.updatedAt.getTime(), lastEventAt(thread.threadId) ?? 0),
      0,
    );
    const lastActivityAt = Math.max(
      row.lastActivityAt.getTime(),
      runtimeActivity.lastAt(row.runtimeId) ?? 0,
    );
    const autoStopSeconds = isCloudProvider(row.provider)
      ? cloudProvider(row.provider).capabilities.defaultAutoStopSeconds
      : 7200;
    const decision = decideSandboxAction(
      {
        runtimeId: row.runtimeId,
        state: row.state,
        externalId: row.externalId,
        runtimeSnapshotName: row.runtimeSnapshotName,
        dirty: row.dirty,
        runningSince: row.runningSince?.getTime() ?? null,
        lastActivityAt,
        lastAgentAt,
        agentRunning,
        stoppedAt: row.stoppedAt?.getTime() ?? null,
        drainRequestedAt: row.drainRequestedAt?.getTime() ?? null,
        lastExtendedAt: row.lastExtendedAt?.getTime() ?? null,
        expiresAt: row.expiresAt?.getTime() ?? null,
        deleteAttempts: row.deleteAttempts,
        nextRetryAt: row.nextRetryAt?.getTime() ?? null,
        drainingProvider: row.providerConfigId !== null && drainingSet.has(row.providerConfigId),
        budgetExceeded,
      },
      policy,
      atMs,
      autoStopSeconds,
    );

    switch (decision.action) {
      case "noop":
        return 0;
      case "drain": {
        const claimed = await cloudSandboxStore.markDraining(
          row.runtimeId,
          row.version,
          new Date(decision.deadlineAt),
          at,
        );

        if (claimed) hub.drainRuntime(row.runtimeId, decision.reason as RunDrainReason);

        return claimed ? 1 : 0;
      }
      case "force_stop":
        return (await stopRow(row, policy, at, decision.reason)) ? 1 : 0;
      case "extend": {
        const credentials = await credentialsFor(row);
        await cloudSandboxStore.markExtended(row.runtimeId, at);
        await extendCloudRuntime(
          row.runtimeId,
          { ttlSeconds: decision.ttlSeconds },
          credentials,
        ).catch((error: unknown) =>
          console.warn(
            `Could not extend the Aven Cloud computer ${row.runtimeId}:`,
            describeError(error),
          ),
        );
        return 0;
      }
      case "delete":
        return (await deleteRow(row, policy, at)) ? 1 : 0;
      case "reconcile_stuck":
        await reconcileStuck(row, decision.state, policy, at);
        return 1;
    }
  }

  async function finalizeDrainingProviders(drainingIds: string[], at: Date) {
    for (const configId of drainingIds) {
      const remainingBoxes = await cloudSandboxStore.remainingForConfig(configId);

      if (remainingBoxes > 0) continue;

      const remainingEnvs = await environmentsService.remainingForConfig(configId);

      if (remainingEnvs > 0) continue;

      await cloudSettingsService.markDrained(configId, at);
    }
  }

  async function sweep(atMs = now()) {
    const at = new Date(atMs);
    const basePolicy = await cloudLifecycleService.policy();
    await cloudSandboxStore.syncLegacyRuntimes(basePolicy.expireMs);
    const spend = await spendBrakeService.verdict(at);
    const windows = effectiveIdleWindows(
      { agentIdleMs: basePolicy.agentIdleMs, userIdleMs: basePolicy.userIdleMs },
      spend.state,
    );
    const policy: LifecyclePolicy = {
      ...basePolicy,
      agentIdleMs: windows.agentIdleMs,
      userIdleMs: windows.userIdleMs,
    };
    const draining = await cloudSettingsService.drainingConfigs();
    const drainingIds = draining.map((row) => row.id);
    const drainingSet = new Set(drainingIds);
    const budgetExceeded = spend.state === "hard_stop";
    let acted = 0;
    let after: string | undefined;

    for (;;) {
      const page = await cloudSandboxStore.activePage({
        now: at,
        drainingConfigIds: drainingIds,
        limit: pageSize,
        after,
      });

      if (page.length === 0) break;

      const byRuntime = await threadsByRuntime(page.map((row) => row.runtimeId));

      for (const row of page) {
        acted += await visit(
          row,
          byRuntime.get(row.runtimeId) ?? [],
          policy,
          atMs,
          drainingSet,
          budgetExceeded,
        );
      }

      const last = page.at(-1)?.runtimeId;

      if (page.length < pageSize || last === undefined) break;

      after = last;
    }

    for (const envRow of await environmentsService.expired(at, drainingIds)) {
      try {
        if (await environmentsService.forget(envRow)) acted += 1;
      } catch (error) {
        console.warn(
          `Could not forget the environment of project ${envRow.projectId}:`,
          describeError(error),
        );
      }
    }

    await finalizeDrainingProviders(drainingIds, at);
    return acted;
  }

  const poller = createPoller({
    intervalMs,
    run: async () => {
      await sweep();
    },
    onError: (error) =>
      console.warn("A cloud lifecycle reconciliation sweep failed:", describeError(error)),
  });

  return { sweep, start: poller.start, close: poller.close };
}
