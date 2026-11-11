import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { db } from "@aven/db/client";
import { runtimes } from "@aven/db/schema/runtimes";
import { and, desc, eq, isNull, or } from "drizzle-orm";

import type { CreateRuntimeBody, RuntimeChanges } from "./schema";
import type { RuntimeRow } from "@aven/db/schema/types";

const TOKEN_PREFIX = "avrt_";

const LOCAL_RUNNER_OFF = "off";

export const LOCAL_RUNTIME_ID = "00000000-0000-4000-8000-000000000001";

const TOKEN_RULE = `${TOKEN_PREFIX} prefix and at least 32 characters`;

const TOKEN_COMMAND = `echo "${TOKEN_PREFIX}$(openssl rand -hex 24)"`;

export function localRunnerToken(configured: string | undefined, localRunner: string | undefined) {
  if (configured) {
    if (!configured.startsWith(TOKEN_PREFIX) || configured.length < 32)
      throw new Error(
        `AVEN_LOCAL_RUNNER_TOKEN must start with ${TOKEN_PREFIX} and be at least 32 characters long`,
      );
    return configured;
  }
  if (localRunner !== LOCAL_RUNNER_OFF)
    throw new Error(
      `AVEN_LOCAL_RUNNER_TOKEN is required while the built-in runner is on, since a token made up here would exist in this process alone: make one with ${TOKEN_COMMAND} (${TOKEN_RULE}), or set AVEN_LOCAL_RUNNER=${LOCAL_RUNNER_OFF} to run only with the runners you attach`,
    );
  return `${TOKEN_PREFIX}local_${randomBytes(32).toString("base64url")}`;
}

const configuredLocalToken = process.env.AVEN_LOCAL_RUNNER_TOKEN;

const localToken = configuredLocalToken
  ? localRunnerToken(configuredLocalToken, process.env.AVEN_LOCAL_RUNNER)
  : localRunnerToken(undefined, LOCAL_RUNNER_OFF);

const visibleTo = (organizationId: string) =>
  or(eq(runtimes.organizationId, organizationId), eq(runtimes.id, LOCAL_RUNTIME_ID));

const usableBy = (userId: string) =>
  or(eq(runtimes.host, false), eq(runtimes.id, LOCAL_RUNTIME_ID), eq(runtimes.ownerId, userId));

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

function issueToken() {
  const token = `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  return { token, columns: { tokenHash: hashToken(token), tokenHint: token.slice(-4) } };
}

const ownedBy = (organizationId: string, ownerId: string, id: string) =>
  and(
    eq(runtimes.organizationId, organizationId),
    eq(runtimes.ownerId, ownerId),
    eq(runtimes.id, id),
    isNull(runtimes.revokedAt),
  );

const sameToken = (a: string, b: string) =>
  timingSafeEqual(Buffer.from(hashToken(a)), Buffer.from(hashToken(b)));

const publicRuntime = ({ tokenHash: _hash, ...runtime }: RuntimeRow) => runtime;

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

  async list(organizationId: string, userId: string) {
    const rows = await db
      .select()
      .from(runtimes)
      .where(and(visibleTo(organizationId), usableBy(userId), isNull(runtimes.revokedAt)))
      .orderBy(desc(runtimes.createdAt));
    return rows.map(publicRuntime);
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
    return row ? publicRuntime(row) : null;
  },

  async create(organizationId: string, ownerId: string, body: CreateRuntimeBody) {
    const { token, columns } = issueToken();
    const [row] = await db
      .insert(runtimes)
      .values({ organizationId, ownerId, name: body.name, ...columns })
      .returning();
    return { runtime: publicRuntime(row!), token };
  },

  async setHost(id: string, host: boolean) {
    await db.update(runtimes).set({ host }).where(eq(runtimes.id, id));
  },

  async setDirectories(id: string, directories: string[]) {
    await db.update(runtimes).set({ directories }).where(eq(runtimes.id, id));
  },

  async change(organizationId: string, id: string, changes: RuntimeChanges) {
    const [row] = await db
      .update(runtimes)
      .set(changes)
      .where(and(visibleTo(organizationId), eq(runtimes.id, id), isNull(runtimes.revokedAt)))
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
    const [row] = await db
      .update(runtimes)
      .set(columns)
      .where(ownedBy(organizationId, ownerId, id))
      .returning();
    return row ? { runtime: publicRuntime(row), token } : null;
  },

  async authenticate(token: string) {
    if (!token.startsWith(TOKEN_PREFIX)) return null;
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

  async agentHostOf(id: string) {
    const [row] = await db
      .select({ agentHost: runtimes.agentHost })
      .from(runtimes)
      .where(and(eq(runtimes.id, id), isNull(runtimes.revokedAt)));
    return row?.agentHost;
  },

  async touch(id: string) {
    await db.update(runtimes).set({ lastSeenAt: new Date() }).where(eq(runtimes.id, id));
  },
};
