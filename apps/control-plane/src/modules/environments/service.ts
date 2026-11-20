import { db } from "@aven/db/client";
import { projectEnvironments } from "@aven/db/schema/project-environments";
import { and, eq, inArray, isNull, lt, lte, ne, or } from "drizzle-orm";

import { ConflictError, describeError } from "@aven/server-kit/errors";
import { cloudProvider, isCloudProvider } from "@aven/sandbox/cloud-config";
import {
  DEFAULT_MAX_DELETE_ATTEMPTS,
  deleteRetryPlan,
  FAILED_ENVIRONMENT_TTL_MS,
  SAVING_ENVIRONMENT_TTL_MS,
} from "@aven/sandbox/lifecycle";
import type { CloudProviderName } from "@aven/sandbox/cloud-config";
import type { ProviderCredentials } from "@aven/sandbox/types";
import type { ProjectEnvironmentRow } from "@aven/db/schema/types";
import type { RuntimeProviderKind } from "@aven/protocol/types";
import type {
  EnvironmentProvider,
  EnvironmentSaveInput,
  EnvironmentSaved,
  EnvironmentSnapshot,
} from "./types";

const HOUR_MS = 3_600_000;

export const ENVIRONMENT_TTL_MS = 72 * HOUR_MS;

export function environmentName(projectId: string) {
  return `aven-${projectId}`;
}

function snapshotOf(row: ProjectEnvironmentRow): EnvironmentSnapshot {
  return {
    name: row.name,
    status: row.status,
    setupDigest: row.setupDigest,
    savedAt: row.savedAt,
    expiresAt: row.expiresAt,
  };
}

function initialExpiresAt(status: EnvironmentSaved["status"], now: Date) {
  if (status === "ready") return new Date(now.getTime() + ENVIRONMENT_TTL_MS);

  if (status === "failed") return new Date(now.getTime() + FAILED_ENVIRONMENT_TTL_MS);

  return new Date(now.getTime() + SAVING_ENVIRONMENT_TTL_MS);
}

export function createEnvironmentsService(
  providerOf: (kind: CloudProviderName) => EnvironmentProvider = cloudProvider,
  credentialsOf: (configId: string) => Promise<ProviderCredentials | null> = async () => null,
) {
  const providerFor = (kind: RuntimeProviderKind) =>
    isCloudProvider(kind) ? providerOf(kind) : null;

  async function resolveCredentials(configId: string | null) {
    if (!configId) return undefined;

    return (await credentialsOf(configId)) ?? undefined;
  }

  async function settle(row: ProjectEnvironmentRow) {
    const credentials = await resolveCredentials(row.providerConfigId);
    const saved = await providerFor(row.provider)
      ?.readEnvironment(row.name, credentials)
      .catch(() => undefined);

    if (saved === undefined || saved?.status === "saving") return row;

    const now = new Date();
    const [settled] = await db
      .update(projectEnvironments)
      .set(
        saved?.status === "ready"
          ? {
              status: "ready",
              error: null,
              savedAt: now,
              expiresAt: new Date(now.getTime() + ENVIRONMENT_TTL_MS),
            }
          : {
              status: "failed",
              error: saved?.error ?? "The saved environment is gone",
              expiresAt: new Date(now.getTime() + FAILED_ENVIRONMENT_TTL_MS),
            },
      )
      .where(eq(projectEnvironments.id, row.id))
      .returning();
    return settled ?? row;
  }

  async function recordDeleteFailure(row: ProjectEnvironmentRow, reason: string) {
    const attempts = row.deleteAttempts + 1;
    const plan = deleteRetryPlan(attempts, Date.now(), DEFAULT_MAX_DELETE_ATTEMPTS);
    await db
      .update(projectEnvironments)
      .set({
        status: plan.giveUp ? "delete_failed" : "deleting",
        deleteAttempts: attempts,
        nextRetryAt: plan.nextRetryAt ? new Date(plan.nextRetryAt) : null,
        lastError: reason.slice(0, 500),
      })
      .where(eq(projectEnvironments.id, row.id));
  }

  async function forget(row: ProjectEnvironmentRow) {
    const provider = providerFor(row.provider);

    if (provider) {
      const credentials = await resolveCredentials(row.providerConfigId);
      let removed = false;
      let reason = "The provider refused to delete the saved snapshot";

      try {
        removed = await provider.removeEnvironment(row.name, credentials);
      } catch (error) {
        reason = describeError(error);
      }

      if (!removed) {
        await recordDeleteFailure(row, reason);
        return false;
      }
    }

    await db.delete(projectEnvironments).where(eq(projectEnvironments.id, row.id));
    return true;
  }

  async function fresh(row: ProjectEnvironmentRow | undefined) {
    if (!row) return null;

    if (row.status === "deleting" || row.status === "delete_failed") return null;

    const settled = row.status === "saving" ? await settle(row) : row;

    if (settled.status !== "ready" || !settled.expiresAt) return settled;

    if (settled.expiresAt.getTime() > Date.now()) return settled;

    await forget(settled);
    return null;
  }

  async function read({
    projectId,
    provider,
  }: {
    projectId: string;
    provider: RuntimeProviderKind;
  }) {
    const [row] = await db
      .select()
      .from(projectEnvironments)
      .where(
        and(
          eq(projectEnvironments.projectId, projectId),
          eq(projectEnvironments.provider, provider),
        ),
      );
    return row;
  }

  function store(row: EnvironmentSaved, input: EnvironmentSaveInput) {
    const now = new Date();
    const ready = row.status === "ready";
    const savedAt = ready ? now : null;
    const expiresAt = initialExpiresAt(row.status, now);
    return db
      .insert(projectEnvironments)
      .values({
        organizationId: input.organizationId,
        projectId: input.projectId,
        provider: input.provider,
        providerConfigId: input.providerConfigId ?? null,
        name: row.name,
        setupDigest: input.setupDigest,
        status: row.status,
        error: row.error,
        savedAt,
        expiresAt,
        deleteAttempts: 0,
        nextRetryAt: null,
        lastError: null,
      })
      .onConflictDoUpdate({
        target: [projectEnvironments.projectId, projectEnvironments.provider],
        set: {
          providerConfigId: input.providerConfigId ?? null,
          name: row.name,
          setupDigest: input.setupDigest,
          status: row.status,
          error: row.error,
          savedAt,
          expiresAt,
          deleteAttempts: 0,
          nextRetryAt: null,
          lastError: null,
        },
      })
      .returning();
  }

  return {
    name: environmentName,

    async ready(projectId: string, provider: RuntimeProviderKind) {
      const row = await fresh(await read({ projectId, provider }));

      if (!row || row.status !== "ready") return null;

      return snapshotOf(row);
    },

    async view(projectId: string, provider: RuntimeProviderKind) {
      const row = await fresh(await read({ projectId, provider }));
      return row ? snapshotOf(row) : null;
    },

    async start(input: EnvironmentSaveInput) {
      const provider = providerFor(input.provider);

      if (!provider) throw new ConflictError("Only an Aven Cloud computer can keep an environment");

      if (!input.sandboxId)
        throw new ConflictError("This thread's Aven Cloud computer has not started yet");

      const name = environmentName(input.projectId);
      const previous = await read({ projectId: input.projectId, provider: input.provider });
      const credentials = await resolveCredentials(input.providerConfigId ?? null);
      const saved = await provider.saveEnvironment(input.sandboxId, name, credentials);
      const [row] = await store(saved, input);

      if (previous && previous.name !== saved.name) {
        const previousCredentials = await resolveCredentials(previous.providerConfigId);
        await provider.removeEnvironment(previous.name, previousCredentials).catch(() => undefined);
      }

      return snapshotOf(row!);
    },

    async expired(before: Date, drainingConfigIds: string[] = []) {
      const due = or(
        isNull(projectEnvironments.expiresAt),
        lt(projectEnvironments.expiresAt, before),
        drainingConfigIds.length > 0
          ? inArray(projectEnvironments.providerConfigId, drainingConfigIds)
          : undefined,
      );
      const readyToRetry = or(
        ne(projectEnvironments.status, "deleting"),
        isNull(projectEnvironments.nextRetryAt),
        lte(projectEnvironments.nextRetryAt, before),
      );
      return db
        .select()
        .from(projectEnvironments)
        .where(and(ne(projectEnvironments.status, "delete_failed"), due, readyToRetry));
    },

    async remainingForConfig(configId: string) {
      const rows = await db
        .select({ id: projectEnvironments.id })
        .from(projectEnvironments)
        .where(eq(projectEnvironments.providerConfigId, configId))
        .limit(1);
      return rows.length;
    },

    forget,
  };
}

import { credentialsForConfig } from "../cloud-settings/credentials";

export const environmentsService = createEnvironmentsService(cloudProvider, credentialsForConfig);
