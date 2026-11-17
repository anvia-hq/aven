import { db } from "@aven/db/client";
import { projectEnvironments } from "@aven/db/schema/project-environments";
import { and, eq, isNotNull, lt } from "drizzle-orm";

import { ConflictError } from "@aven/server-kit/errors";
import { cloudProvider, isCloudProvider } from "@aven/sandbox/cloud-config";
import type { CloudProviderName } from "@aven/sandbox/cloud-config";
import type {
  EnvironmentProvider,
  EnvironmentSaveInput,
  EnvironmentSaved,
  EnvironmentSnapshot,
} from "./types";
import type { ProjectEnvironmentRow } from "@aven/db/schema/types";
import type { RuntimeProviderKind } from "@aven/protocol/types";

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

export function createEnvironmentsService(
  providerOf: (kind: CloudProviderName) => EnvironmentProvider = cloudProvider,
) {
  const providerFor = (kind: RuntimeProviderKind) =>
    isCloudProvider(kind) ? providerOf(kind) : null;

  async function settle(row: ProjectEnvironmentRow) {
    const saved = await providerFor(row.provider)
      ?.readEnvironment(row.name)
      .catch(() => undefined);

    if (saved === undefined || saved?.status === "saving") return row;

    const [settled] = await db
      .update(projectEnvironments)
      .set(
        saved?.status === "ready"
          ? {
              status: "ready",
              error: null,
              savedAt: new Date(),
              expiresAt: new Date(Date.now() + ENVIRONMENT_TTL_MS),
            }
          : {
              status: "failed",
              error: saved?.error ?? "The saved environment is gone",
            },
      )
      .where(eq(projectEnvironments.id, row.id))
      .returning();
    return settled ?? row;
  }

  async function forget(row: ProjectEnvironmentRow) {
    const provider = providerFor(row.provider);

    if (provider) {
      const removed = await provider.removeEnvironment(row.name).catch(() => false);

      if (!removed) return false;
    }

    await db.delete(projectEnvironments).where(eq(projectEnvironments.id, row.id));
    return true;
  }

  async function fresh(row: ProjectEnvironmentRow | undefined) {
    if (!row) return null;

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
    const ready = row.status === "ready";
    const savedAt = ready ? new Date() : null;
    const expiresAt = ready ? new Date(Date.now() + ENVIRONMENT_TTL_MS) : null;
    return db
      .insert(projectEnvironments)
      .values({
        organizationId: input.organizationId,
        projectId: input.projectId,
        provider: input.provider,
        name: row.name,
        setupDigest: input.setupDigest,
        status: row.status,
        error: row.error,
        savedAt,
        expiresAt,
      })
      .onConflictDoUpdate({
        target: [projectEnvironments.projectId, projectEnvironments.provider],
        set: {
          name: row.name,
          setupDigest: input.setupDigest,
          status: row.status,
          error: row.error,
          savedAt,
          expiresAt,
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
      const saved = await provider.saveEnvironment(input.sandboxId, name);
      const [row] = await store(saved, input);
      return snapshotOf(row!);
    },

    async expired(before: Date) {
      return db
        .select()
        .from(projectEnvironments)
        .where(
          and(isNotNull(projectEnvironments.expiresAt), lt(projectEnvironments.expiresAt, before)),
        );
    },

    forget,
  };
}

export const environmentsService = createEnvironmentsService();
