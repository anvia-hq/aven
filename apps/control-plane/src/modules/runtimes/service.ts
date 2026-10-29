import { createHash, randomBytes } from "node:crypto";

import { db } from "@aven/db/client";
import { runtimes, type RuntimeRow } from "@aven/db/schema/runtimes";
import { and, desc, eq, isNull } from "drizzle-orm";

import type { CreateRuntimeBody } from "./schema";

const TOKEN_PREFIX = "avrt_";

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

// Never returns the token hash.
const publicRuntime = ({ tokenHash: _hash, ...runtime }: RuntimeRow) => runtime;

export const runtimesService = {
  // Runtimes are shared with the whole organization, so listing is by organization.
  async list(organizationId: string) {
    const rows = await db
      .select()
      .from(runtimes)
      .where(and(eq(runtimes.organizationId, organizationId), isNull(runtimes.revokedAt)))
      .orderBy(desc(runtimes.createdAt));
    return rows.map(publicRuntime);
  },

  async get(organizationId: string, id: string) {
    const [row] = await db
      .select()
      .from(runtimes)
      .where(
        and(
          eq(runtimes.organizationId, organizationId),
          eq(runtimes.id, id),
          isNull(runtimes.revokedAt),
        ),
      );
    return row ? publicRuntime(row) : null;
  },

  // The token is returned once, here, and only its hash is stored.
  async create(organizationId: string, ownerId: string, body: CreateRuntimeBody) {
    const token = `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
    const [row] = await db
      .insert(runtimes)
      .values({
        organizationId,
        ownerId,
        name: body.name,
        tokenHash: hashToken(token),
        tokenHint: token.slice(-4),
      })
      .returning();
    return { runtime: publicRuntime(row!), token };
  },

  // Only the owner can revoke. A project that uses the runtime keeps its row and fails to run.
  async revoke(organizationId: string, ownerId: string, id: string) {
    const [row] = await db
      .update(runtimes)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(runtimes.organizationId, organizationId),
          eq(runtimes.ownerId, ownerId),
          eq(runtimes.id, id),
          isNull(runtimes.revokedAt),
        ),
      )
      .returning();
    return row ? publicRuntime(row) : null;
  },

  // Resolves a connection token; a revoked or unknown token is simply not found.
  async authenticate(token: string) {
    if (!token.startsWith(TOKEN_PREFIX)) return null;
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
