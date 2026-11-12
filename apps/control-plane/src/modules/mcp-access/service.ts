import { createHash, randomBytes } from "node:crypto";

import { db } from "@aven/db/client";
import { mcpAccessTokens } from "@aven/db/schema/mcp-access-tokens";
import { ACCESS_LIMIT, ACCESS_TOKEN_PREFIX } from "@aven/protocol/mcp-access";
import { and, asc, count, eq } from "drizzle-orm";

import { ConflictError } from "../../errors";
import type { CreateAccessTokenBody } from "./schema";
import type { McpCaller } from "./types";
import type { AccessPermission, AccessToken, AccessTokenCreated } from "@aven/protocol/types";

const TOUCH_EVERY_MS = 60_000;

const hashOf = (token: string) => createHash("sha256").update(token).digest("hex");

const PERMISSIONS = new Set<string>(["read", "change", "destructive"]);

const permissionsOf = (stored: string[]) =>
  stored.filter((item): item is AccessPermission => PERMISSIONS.has(item));

function view(row: typeof mcpAccessTokens.$inferSelect): AccessToken {
  return {
    id: row.id,
    name: row.name,
    hint: row.tokenHint,
    permissions: permissionsOf(row.permissions),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export const mcpAccessService = {
  async list(userId: string) {
    const rows = await db
      .select()
      .from(mcpAccessTokens)
      .where(eq(mcpAccessTokens.userId, userId))
      .orderBy(asc(mcpAccessTokens.createdAt));
    return rows.map(view);
  },

  async create(userId: string, body: CreateAccessTokenBody): Promise<AccessTokenCreated> {
    const [{ total } = { total: 0 }] = await db
      .select({ total: count() })
      .from(mcpAccessTokens)
      .where(eq(mcpAccessTokens.userId, userId));

    if (total >= ACCESS_LIMIT) {
      throw new ConflictError(`You can have ${ACCESS_LIMIT} access tokens; remove one first`);
    }

    const token = `${ACCESS_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
    const [row] = await db
      .insert(mcpAccessTokens)
      .values({
        userId,
        name: body.name,
        tokenHash: hashOf(token),
        tokenHint: token.slice(-4),
        permissions: [...new Set(body.permissions)],
      })
      .returning();

    return { ...view(row!), token };
  },

  async remove(userId: string, id: string) {
    const removed = await db
      .delete(mcpAccessTokens)
      .where(and(eq(mcpAccessTokens.id, id), eq(mcpAccessTokens.userId, userId)))
      .returning({ id: mcpAccessTokens.id });
    return removed.length > 0;
  },

  async authenticate(token: string): Promise<McpCaller | undefined> {
    if (!token.startsWith(ACCESS_TOKEN_PREFIX)) return undefined;

    const [row] = await db
      .select()
      .from(mcpAccessTokens)
      .where(eq(mcpAccessTokens.tokenHash, hashOf(token)));

    if (!row) return undefined;

    const now = Date.now();

    if (!row.lastUsedAt || now - row.lastUsedAt.getTime() > TOUCH_EVERY_MS) {
      await db
        .update(mcpAccessTokens)
        .set({ lastUsedAt: new Date(now) })
        .where(eq(mcpAccessTokens.id, row.id));
    }

    return { userId: row.userId, tokenId: row.id, permissions: permissionsOf(row.permissions) };
  },
};
