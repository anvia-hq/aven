import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { db } from "@aven/db/client";
import { runtimes, type RuntimeRow } from "@aven/db/schema/runtimes";
import { and, desc, eq, isNull, or } from "drizzle-orm";

import type { CreateRuntimeBody } from "./schema";

const TOKEN_PREFIX = "avrt_";

/** The control plane's own runner, the same row for every organization. */
export const LOCAL_RUNTIME_ID = "00000000-0000-4000-8000-000000000001";

/**
 * What the built-in runner presents to connect. Without `AVEN_LOCAL_RUNNER_TOKEN` it is made here
 * and exists only in this process's memory, which is all the in-process runner needs. A server
 * whose built-in runner is a separate process on the same machine (`AVEN_LOCAL_RUNNER=host`,
 * decision 0073) sets one, so that process can present it.
 */
export function localRunnerToken(configured: string | undefined) {
  if (!configured) return `${TOKEN_PREFIX}local_${randomBytes(32).toString("base64url")}`;
  if (!configured.startsWith(TOKEN_PREFIX) || configured.length < 32)
    throw new Error(
      `AVEN_LOCAL_RUNNER_TOKEN must start with ${TOKEN_PREFIX} and be at least 32 characters long`,
    );
  return configured;
}

const localToken = localRunnerToken(process.env.AVEN_LOCAL_RUNNER_TOKEN);

// An organization's own runners, and the built-in one.
const visibleTo = (organizationId: string) =>
  or(eq(runtimes.organizationId, organizationId), eq(runtimes.id, LOCAL_RUNTIME_ID));

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

// A fresh connection token and what is stored of it: the hash to check it by and a hint to show.
function issueToken() {
  const token = `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  return { token, columns: { tokenHash: hashToken(token), tokenHint: token.slice(-4) } };
}

// A runner an organization's member owns and has not revoked: what only its owner may change.
const ownedBy = (organizationId: string, ownerId: string, id: string) =>
  and(
    eq(runtimes.organizationId, organizationId),
    eq(runtimes.ownerId, ownerId),
    eq(runtimes.id, id),
    isNull(runtimes.revokedAt),
  );

const sameToken = (a: string, b: string) =>
  timingSafeEqual(Buffer.from(hashToken(a)), Buffer.from(hashToken(b)));

// Never returns the token hash.
const publicRuntime = ({ tokenHash: _hash, ...runtime }: RuntimeRow) => runtime;

export const runtimesService = {
  localToken,

  // Makes sure the built-in runner's row exists. Its token hash matches nothing anyone can send:
  // it connects with `localToken`, which `authenticate` recognizes.
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

  // Runners are shared with the whole organization, so listing is by organization.
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

  // The token is returned once, here, and only its hash is stored.
  async create(organizationId: string, ownerId: string, body: CreateRuntimeBody) {
    const { token, columns } = issueToken();
    const [row] = await db
      .insert(runtimes)
      .values({ organizationId, ownerId, name: body.name, ...columns })
      .returning();
    return { runtime: publicRuntime(row!), token };
  },

  // Only the owner can revoke. A project that uses the runtime keeps its row and fails to run.
  // The caller cuts off a revoked runtime's connection.
  async revoke(organizationId: string, ownerId: string, id: string) {
    const [row] = await db
      .update(runtimes)
      .set({ revokedAt: new Date() })
      .where(ownedBy(organizationId, ownerId, id))
      .returning();
    return row ? publicRuntime(row) : null;
  },

  // Replaces the token. The old one stops working at once and the runtime is cut off, so it must
  // be restarted with the new one. The caller cuts the old connection off. Owner only.
  async rotate(organizationId: string, ownerId: string, id: string) {
    const { token, columns } = issueToken();
    const [row] = await db
      .update(runtimes)
      .set(columns)
      .where(ownedBy(organizationId, ownerId, id))
      .returning();
    return row ? { runtime: publicRuntime(row), token } : null;
  },

  // Resolves a connection token; a revoked or unknown token is simply not found.
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

  // Whether a runner `authenticate` found still holds: not revoked, its token not rotated since.
  // A socket that was upgraded while a revoke landed asks this once attached; the revoke's own
  // disconnect only reaches sockets that were already attached.
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
