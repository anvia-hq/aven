import { randomBytes } from "node:crypto";

import { db } from "@aven/db/client";
import { cloudSandboxes } from "@aven/db/schema/cloud-sandboxes";
import { runtimes } from "@aven/db/schema/runtimes";
import { threads } from "@aven/db/schema/threads";
import {
  RUNNER_TOKEN_MIN_LENGTH,
  RUNNER_TOKEN_PREFIX,
  isRunnerTokenFormat,
} from "@aven/protocol/runtimes";
import { and, count, desc, eq, inArray, isNull, ne, notInArray, or } from "drizzle-orm";

import { decryptOrUnavailable, encryptSecret } from "@aven/server-kit/crypto";
import { ConflictError, UnavailableError } from "@aven/server-kit/errors";
import { hashOpaqueToken, issueOpaqueToken, sameOpaqueToken } from "@aven/server-kit/tokens";
import {
  CLOUD_OFF,
  CLOUD_RUNTIME_ID,
  CLOUD_TEMPLATE_IDS,
  LIZARD_RUNTIME_ID,
  SPACES_RUNTIME_ID,
  cloudEnabled,
  cloudProviderApiKey,
  cloudTemplateId,
  cloudTemplateName,
  disabledTemplateIds,
  enabledCloudProviders,
  enabledTemplateIds,
  templateProvider,
} from "@aven/sandbox/cloud-config";
import { cloudSandboxStore } from "../cloud-lifecycle/sandbox-store";
import { activeProviderConfigId, credentialsForConfig } from "../cloud-settings/credentials";
import { LOCAL_RUNTIME_ID } from "./local-id";
import { environmentsService } from "../environments/service";
import type { SandboxRecord } from "@aven/sandbox/types";
import type { CreateRuntimeBody } from "./schema";
import type { RuntimeRow } from "@aven/db/schema/types";
import type { RuntimeGithubMode, RuntimeProviderKind } from "@aven/protocol/types";

export { CLOUD_OFF, CLOUD_RUNTIME_ID, LIZARD_RUNTIME_ID, LOCAL_RUNTIME_ID, SPACES_RUNTIME_ID };

const LOCAL_RUNNER_OFF = "off";

const TOKEN_RULE = `${RUNNER_TOKEN_PREFIX} prefix and at least ${RUNNER_TOKEN_MIN_LENGTH} characters`;

const TOKEN_COMMAND = `echo "${RUNNER_TOKEN_PREFIX}$(openssl rand -hex 24)"`;

export function localRunnerToken(configured: string | undefined, localRunner: string | undefined) {
  if (configured) {
    if (!isRunnerTokenFormat(configured))
      throw new Error(
        `AVEN_LOCAL_RUNNER_TOKEN must start with ${RUNNER_TOKEN_PREFIX} and be at least ${RUNNER_TOKEN_MIN_LENGTH} characters long`,
      );

    return configured;
  }

  if (localRunner !== LOCAL_RUNNER_OFF)
    throw new Error(
      `AVEN_LOCAL_RUNNER_TOKEN is required while the built-in runner is on, since a token made up here would exist in this process alone: make one with ${TOKEN_COMMAND} (${TOKEN_RULE}), or set AVEN_LOCAL_RUNNER=${LOCAL_RUNNER_OFF} to run only with the runners you attach`,
    );

  return `${RUNNER_TOKEN_PREFIX}local_${randomBytes(32).toString("base64url")}`;
}

const configuredLocalToken = process.env.AVEN_LOCAL_RUNNER_TOKEN;

const localToken = configuredLocalToken
  ? localRunnerToken(configuredLocalToken, process.env.AVEN_LOCAL_RUNNER)
  : localRunnerToken(undefined, LOCAL_RUNNER_OFF);

const visibleTo = (organizationId: string) =>
  or(
    eq(runtimes.organizationId, organizationId),
    eq(runtimes.id, LOCAL_RUNTIME_ID),
    enabledTemplateIds().length > 0 ? inArray(runtimes.id, enabledTemplateIds()) : undefined,
  );

const usableBy = (userId: string) =>
  and(
    or(
      eq(runtimes.host, false),
      eq(runtimes.id, LOCAL_RUNTIME_ID),
      inArray(runtimes.id, CLOUD_TEMPLATE_IDS),
      eq(runtimes.ownerId, userId),
    ),
    or(isNull(runtimes.parentRuntimeId), eq(runtimes.ownerId, userId)),
  );

const hashToken = hashOpaqueToken;

function issueToken() {
  const { token, tokenHash, tokenHint } = issueOpaqueToken(RUNNER_TOKEN_PREFIX);
  return { token, columns: { tokenHash, tokenHint } };
}

const ownedBy = (organizationId: string, ownerId: string, id: string) =>
  and(
    eq(runtimes.organizationId, organizationId),
    eq(runtimes.ownerId, ownerId),
    eq(runtimes.id, id),
    isNull(runtimes.revokedAt),
  );

const sameToken = sameOpaqueToken;

const publicRuntime = ({
  tokenHash: _hash,
  boatRunnerTokenEncrypted: _runnerToken,
  ...runtime
}: RuntimeRow) => ({
  ...runtime,
  githubMode: runtime.lifetime === "ephemeral" ? ("person" as const) : runtime.githubMode,
});

const named = (row: RuntimeRow) => {
  const runtime = publicRuntime(row);
  const provider = templateProvider(row.id);

  return provider ? { ...runtime, name: cloudTemplateName(provider) } : runtime;
};

function readRunnerToken(stored: string | null, id: string) {
  if (!stored) return null;

  return decryptOrUnavailable(stored, {
    logged: `Could not decrypt the runner token of Aven Cloud computer ${id}:`,
    message: "This Aven Cloud computer's saved token could not be read",
  });
}

function encryptedRunnerToken(token: string) {
  return { boatRunnerTokenEncrypted: encryptSecret(token) };
}

export const runtimesService = {
  localToken,

  async ensureLocal() {
    await db
      .insert(runtimes)
      .values({
        id: LOCAL_RUNTIME_ID,
        name: "Control plane",
        tokenHash: hashToken(randomBytes(32).toString("hex")),
        tokenHint: "",
      })
      .onConflictDoNothing();
  },

  async ensureCloud() {
    for (const provider of enabledCloudProviders()) {
      await db
        .insert(runtimes)
        .values({
          id: cloudTemplateId(provider),
          name: cloudTemplateName(provider),
          provider,
          lifetime: "ephemeral",
          githubMode: "person",
          tokenHash: hashToken(randomBytes(32).toString("hex")),
          tokenHint: "",
        })
        .onConflictDoNothing();
    }
  },

  async createCloudSandbox(
    organizationId: string,
    ownerId: string,
    templateId: string,
    projectId: string,
  ) {
    const provider = templateProvider(templateId);

    if (!provider || !cloudEnabled(provider)) throw new UnavailableError(CLOUD_OFF);

    const { token, columns } = issueToken();
    const environment = await environmentsService.ready(projectId, provider);
    const providerConfigId = await activeProviderConfigId();
    const [row] = await db
      .insert(runtimes)
      .values({
        organizationId,
        ownerId,
        parentRuntimeId: templateId,
        name: cloudTemplateName(provider),
        provider,
        lifetime: "ephemeral",
        githubMode: "person",
        boatMachineType: "default",
        environmentSnapshot: environment?.name ?? null,
        ...encryptedRunnerToken(token),
        ...columns,
      })
      .returning();
    await cloudSandboxStore.ensure({
      runtimeId: row!.id,
      provider,
      providerConfigId,
      machineType: "default",
    });
    return publicRuntime(row!);
  },

  async computerOf(runtimeId: string) {
    const [row] = await db
      .select({ organizationId: runtimes.organizationId, userId: runtimes.ownerId })
      .from(runtimes)
      .where(
        and(eq(runtimes.id, runtimeId), inArray(runtimes.parentRuntimeId, CLOUD_TEMPLATE_IDS)),
      );
    return row ?? null;
  },

  async computerRuntimeOf(runtimeId: string) {
    const [row] = await db
      .select({
        id: runtimes.id,
        organizationId: runtimes.organizationId,
        ownerId: runtimes.ownerId,
        parentRuntimeId: runtimes.parentRuntimeId,
        provider: runtimes.provider,
        machineType: runtimes.boatMachineType,
        providerConfigId: cloudSandboxes.providerConfigId,
      })
      .from(runtimes)
      .leftJoin(cloudSandboxes, eq(cloudSandboxes.runtimeId, runtimes.id))
      .where(
        and(eq(runtimes.id, runtimeId), inArray(runtimes.parentRuntimeId, CLOUD_TEMPLATE_IDS)),
      );
    return row ?? null;
  },

  async openThreadsOn(runtimeId: string) {
    const [row] = await db
      .select({ total: count() })
      .from(threads)
      .where(and(eq(threads.runtimeId, runtimeId), ne(threads.state, "archived")));

    return row?.total ?? 0;
  },

  async list(organizationId: string, userId: string) {
    const rows = await db
      .select()
      .from(runtimes)
      .where(
        and(
          visibleTo(organizationId),
          usableBy(userId),
          isNull(runtimes.revokedAt),
          disabledTemplateIds().length > 0
            ? notInArray(runtimes.id, disabledTemplateIds())
            : undefined,
        ),
      )
      .orderBy(desc(runtimes.createdAt));
    return rows.map(named);
  },

  async get(organizationId: string, id: string, userId?: string) {
    const [row] = await db
      .select()
      .from(runtimes)
      .where(
        and(
          visibleTo(organizationId),
          eq(runtimes.id, id),
          userId === undefined ? undefined : usableBy(userId),
          isNull(runtimes.revokedAt),
        ),
      );
    return row ? named(row) : null;
  },

  async create(organizationId: string, ownerId: string, body: CreateRuntimeBody) {
    const { token, columns } = issueToken();
    const [row] = await db
      .insert(runtimes)
      .values({
        organizationId,
        ownerId,
        name: body.name,
        ...columns,
      })
      .returning();
    return { runtime: publicRuntime(row!), token };
  },

  async cloudRecord(
    id: string,
    provider: RuntimeProviderKind,
    revoked = false,
  ): Promise<SandboxRecord | null> {
    const [row] = await db
      .select()
      .from(runtimes)
      .where(revoked ? eq(runtimes.id, id) : and(eq(runtimes.id, id), isNull(runtimes.revokedAt)));

    if (!row || row.provider !== provider || !row.parentRuntimeId) return null;

    const sandboxRow = await cloudSandboxStore.get(row.id);
    const storedCredentials = sandboxRow?.providerConfigId
      ? await credentialsForConfig(sandboxRow.providerConfigId)
      : null;

    if (!storedCredentials && !cloudEnabled(row.provider)) return null;

    const apiKey = storedCredentials?.apiKey ?? cloudProviderApiKey(provider);
    const runnerToken = await readRunnerToken(row.boatRunnerTokenEncrypted, row.id);

    if (!apiKey || !runnerToken) return null;

    return {
      runtimeId: row.id,
      apiKey,
      runnerToken,
      sandboxId: sandboxRow?.externalId ?? row.boatSandboxId,
      machineType: row.boatMachineType ?? "default",
      environment: sandboxRow?.runtimeSnapshotName ?? row.environmentSnapshot,
      credentials: storedCredentials ?? undefined,
    };
  },

  async isExpiredCloud(id: string) {
    const [row] = await db
      .select({ revokedAt: runtimes.revokedAt })
      .from(runtimes)
      .where(and(eq(runtimes.id, id), inArray(runtimes.parentRuntimeId, CLOUD_TEMPLATE_IDS)));
    return row?.revokedAt != null;
  },

  async setBoatSandbox(id: string, sandboxId: string) {
    await db
      .update(runtimes)
      .set({ boatSandboxId: sandboxId })
      .where(and(eq(runtimes.id, id), isNull(runtimes.revokedAt)));
    const existing = await cloudSandboxStore.get(id);
    const configId = existing?.providerConfigId ?? (await activeProviderConfigId());
    await cloudSandboxStore.setExternalId(id, sandboxId, configId);
  },

  async setHost(id: string, host: boolean) {
    await db.update(runtimes).set({ host }).where(eq(runtimes.id, id));
  },

  async setDirectories(id: string, directories: string[]) {
    await db.update(runtimes).set({ directories }).where(eq(runtimes.id, id));
  },

  async rename(organizationId: string, id: string, name: string) {
    const [row] = await db
      .update(runtimes)
      .set({ name })
      .where(
        and(
          visibleTo(organizationId),
          eq(runtimes.id, id),
          notInArray(runtimes.id, CLOUD_TEMPLATE_IDS),
          isNull(runtimes.revokedAt),
        ),
      )
      .returning();
    return row ? publicRuntime(row) : null;
  },

  async revoke(organizationId: string, ownerId: string, id: string) {
    const [row] = await db
      .update(runtimes)
      .set({ revokedAt: new Date() })
      .where(ownedBy(organizationId, ownerId, id))
      .returning();
    return row ? publicRuntime(row) : null;
  },

  async rotate(organizationId: string, ownerId: string, id: string) {
    const { token, columns } = issueToken();
    const [current] = await db
      .select({ provider: runtimes.provider })
      .from(runtimes)
      .where(ownedBy(organizationId, ownerId, id));

    if (!current) return null;

    const encrypted = current.provider !== "manual" ? await encryptedRunnerToken(token) : {};
    const [row] = await db
      .update(runtimes)
      .set({ ...columns, ...encrypted })
      .where(ownedBy(organizationId, ownerId, id))
      .returning();
    return row ? { runtime: publicRuntime(row), token } : null;
  },

  async authenticate(token: string) {
    if (!token.startsWith(RUNNER_TOKEN_PREFIX)) return null;

    if (sameToken(token, localToken)) {
      const [local] = await db.select().from(runtimes).where(eq(runtimes.id, LOCAL_RUNTIME_ID));
      return local ?? null;
    }

    const [row] = await db
      .select()
      .from(runtimes)
      .where(and(eq(runtimes.tokenHash, hashToken(token)), isNull(runtimes.revokedAt)));
    return row ?? null;
  },

  async stillCurrent(runtime: RuntimeRow) {
    const [row] = await db
      .select({ revokedAt: runtimes.revokedAt, tokenHash: runtimes.tokenHash })
      .from(runtimes)
      .where(eq(runtimes.id, runtime.id));
    return row !== undefined && row.revokedAt === null && row.tokenHash === runtime.tokenHash;
  },

  async providerOf(id: string) {
    const [row] = await db
      .select({ provider: runtimes.provider })
      .from(runtimes)
      .where(and(eq(runtimes.id, id), isNull(runtimes.revokedAt)));
    return row?.provider;
  },

  async githubModeOf(id: string): Promise<RuntimeGithubMode> {
    const [row] = await db
      .select({ lifetime: runtimes.lifetime, githubMode: runtimes.githubMode })
      .from(runtimes)
      .where(eq(runtimes.id, id));

    if (row?.lifetime === "ephemeral") return "person";

    return row?.githubMode ?? "machine";
  },

  async setGithubMode(organizationId: string, id: string, githubMode: RuntimeGithubMode) {
    const [current] = await db
      .select({ lifetime: runtimes.lifetime })
      .from(runtimes)
      .where(
        and(
          visibleTo(organizationId),
          eq(runtimes.id, id),
          notInArray(runtimes.id, CLOUD_TEMPLATE_IDS),
          isNull(runtimes.revokedAt),
        ),
      );

    if (!current) return null;

    if (githubMode === "machine" && current.lifetime === "ephemeral")
      throw new ConflictError(
        "A temporary runner has no GitHub login of its own: each person's account is used",
      );

    const [row] = await db
      .update(runtimes)
      .set({ githubMode })
      .where(and(visibleTo(organizationId), eq(runtimes.id, id), isNull(runtimes.revokedAt)))
      .returning();
    return row ? publicRuntime(row) : null;
  },

  async lifetimeOf(id: string) {
    const [row] = await db
      .select({ lifetime: runtimes.lifetime })
      .from(runtimes)
      .where(eq(runtimes.id, id));
    return row?.lifetime ?? "persistent";
  },

  async touch(id: string) {
    await db.update(runtimes).set({ lastSeenAt: new Date() }).where(eq(runtimes.id, id));
  },
};
