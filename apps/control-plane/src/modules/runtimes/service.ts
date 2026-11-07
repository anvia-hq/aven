import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { db } from "@aven/db/client";
import { runtimes, type RuntimeRow } from "@aven/db/schema/runtimes";
import { and, desc, eq, isNull, or } from "drizzle-orm";

import type { CreateRuntimeBody } from "./schema";

const TOKEN_PREFIX = "avrt_";

export const LOCAL_RUNTIME_ID = "00000000-0000-4000-8000-000000000001";

export function localRunnerToken(configured: string | undefined) {
  if (!configured) return `${TOKEN_PREFIX}local_${randomBytes(32).toString("base64url")}`;
  if (!configured.startsWith(TOKEN_PREFIX) || configured.length < 32)
    throw new Error(
      `AVEN_LOCAL_RUNNER_TOKEN must start with ${TOKEN_PREFIX} and be at least 32 characters long`,
    );
  return configured;
}

const localToken = localRunnerToken(process.env.AVEN_LOCAL_RUNNER_TOKEN);

const visibleTo = (organizationId: string) =>
  or(eq(runtimes.organizationId, organizationId), eq(runtimes.id, LOCAL_RUNTIME_ID));

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

  async list(organizationId: string) {
    const rows = await db
      .select()
      .from(runtimes)
      .where(and(visibleTo(organizationId), isNull(runtimes.revokedAt)))
      .orderBy(desc(runtimes.createdAt));
    return rows.map(publicRuntime);
  },

  async get(organizationId: string, id: string) {
    const [row] = await db
      .select()
      .from(runtimes)
      .where(and(visibleTo(organizationId), eq(runtimes.id, id), isNull(runtimes.revokedAt)));
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

  async touch(id: string) {
    await db.update(runtimes).set({ lastSeenAt: new Date() }).where(eq(runtimes.id, id));
  },
};
