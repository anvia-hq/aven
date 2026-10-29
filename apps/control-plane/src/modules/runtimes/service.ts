import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { db } from "@aven/db/client";
import { runtimes, type RuntimeRow } from "@aven/db/schema/runtimes";
import { and, desc, eq, isNull, or } from "drizzle-orm";

import { runtimeHub } from "./hub";
import type { CreateRuntimeBody } from "./schema";

const TOKEN_PREFIX = "avrt_";

/** The control plane's own runner, the same row for every organization. */
export const LOCAL_RUNTIME_ID = "00000000-0000-4000-8000-000000000001";

// What the in-process runner presents to connect; it exists only in this process's memory.
const localToken = `${TOKEN_PREFIX}local_${randomBytes(32).toString("base64url")}`;

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
  async revoke(organizationId: string, ownerId: string, id: string) {
    const [row] = await db
      .update(runtimes)
      .set({ revokedAt: new Date() })
      .where(ownedBy(organizationId, ownerId, id))
      .returning();
    if (row) runtimeHub.disconnect(id, "Revoked");
    return row ? publicRuntime(row) : null;
  },

  // Replaces the token. The old one stops working at once and the runtime is cut off, so it must
  // be restarted with the new one. Owner only.
  async rotate(organizationId: string, ownerId: string, id: string) {
    const { token, columns } = issueToken();
    const [row] = await db
      .update(runtimes)
      .set(columns)
      .where(ownedBy(organizationId, ownerId, id))
      .returning();
    if (!row) return null;
    runtimeHub.disconnect(id, "Token rotated");
    return { runtime: publicRuntime(row), token };
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

  async touch(id: string) {
    await db.update(runtimes).set({ lastSeenAt: new Date() }).where(eq(runtimes.id, id));
  },
};
