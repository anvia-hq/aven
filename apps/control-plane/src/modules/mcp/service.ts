import { db } from "@aven/db/client";
import { mcpServers } from "@aven/db/schema/mcp-servers";
import { MCP_LIMIT, mcpSlug } from "@aven/protocol/mcp";
import { and, asc, count, eq, inArray } from "drizzle-orm";

import { decryptOrUnavailable, encryptSecret } from "../../crypto";
import { ConflictError, UnprocessableError } from "../../errors";
import type { CreateMcpBody, UpdateMcpBody } from "./schema";
import type { McpServerView } from "./types";
import type { McpServerRow } from "@aven/db/schema/types";
import type { McpConnectResult, McpTarget, RunMcpServer } from "@aven/protocol/types";

function view({ headers: _headers, userId: _userId, ...row }: McpServerRow): McpServerView {
  return row;
}

const ownServer = (userId: string, id: string) =>
  and(eq(mcpServers.id, id), eq(mcpServers.userId, userId));

const sealed = (headers: Record<string, string>) => encryptSecret(JSON.stringify(headers));

const unsealed = (stored: string): Record<string, string> =>
  JSON.parse(
    decryptOrUnavailable(stored, {
      logged: "An MCP server's headers could not be decrypted:",
      message: "A saved header could not be read. Enter the server's headers again.",
    }),
  ) as Record<string, string>;

const isDuplicate = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) return false;
  if ("code" in error && error.code === "23505") return true;
  return "cause" in error && isDuplicate(error.cause);
};

const SAME_NAME = "You already have an MCP server with that name";

export const mcpService = {
  async list(userId: string) {
    const rows = await db
      .select()
      .from(mcpServers)
      .where(eq(mcpServers.userId, userId))
      .orderBy(asc(mcpServers.name));
    return rows.map(view);
  },

  async get(userId: string, id: string) {
    const [row] = await db.select().from(mcpServers).where(ownServer(userId, id));
    return row ? view(row) : null;
  },

  async create(userId: string, body: CreateMcpBody) {
    const [{ total } = { total: 0 }] = await db
      .select({ total: count() })
      .from(mcpServers)
      .where(eq(mcpServers.userId, userId));
    if (total >= MCP_LIMIT) {
      throw new UnprocessableError(`You can have at most ${MCP_LIMIT} MCP servers`);
    }
    const headers = Object.fromEntries(body.headers.map((header) => [header.name, header.value]));
    try {
      const [row] = await db
        .insert(mcpServers)
        .values({
          userId,
          name: body.name,
          slug: mcpSlug(body.name),
          url: body.url,
          headers: sealed(headers),
          headerNames: Object.keys(headers),
          target: body.target,
          enabled: body.enabled,
          allowLocal: body.allowLocal,
        })
        .returning();
      return view(row!);
    } catch (error) {
      if (isDuplicate(error)) throw new ConflictError(SAME_NAME);
      throw error;
    }
  },

  async update(userId: string, id: string, body: UpdateMcpBody) {
    const [current] = await db.select().from(mcpServers).where(ownServer(userId, id));
    if (!current) return null;

    const changes: Partial<typeof mcpServers.$inferInsert> = {};
    if (body.name !== undefined) {
      changes.name = body.name;
      changes.slug = mcpSlug(body.name);
    }
    if (body.url !== undefined) changes.url = body.url;
    if (body.target !== undefined) changes.target = body.target;
    if (body.enabled !== undefined) changes.enabled = body.enabled;
    if (body.allowLocal !== undefined) changes.allowLocal = body.allowLocal;
    if (body.headers !== undefined) {
      const saved = unsealed(current.headers);
      const next: Record<string, string> = {};
      for (const header of body.headers) {
        const value = header.value ?? saved[header.name];
        if (value === undefined) {
          throw new UnprocessableError(`There is no saved value for the header ${header.name}`);
        }
        next[header.name] = value;
      }
      changes.headers = sealed(next);
      changes.headerNames = Object.keys(next);
    }
    if (body.url !== undefined || body.headers !== undefined || body.allowLocal !== undefined) {
      changes.lastError = null;
    }

    try {
      const [row] = await db
        .update(mcpServers)
        .set(changes)
        .where(ownServer(userId, id))
        .returning();
      return row ? view(row) : null;
    } catch (error) {
      if (isDuplicate(error)) throw new ConflictError(SAME_NAME);
      throw error;
    }
  },

  async remove(userId: string, id: string) {
    const removed = await db.delete(mcpServers).where(ownServer(userId, id)).returning({
      id: mcpServers.id,
    });
    return removed.length > 0;
  },

  async record(results: readonly McpConnectResult[]) {
    for (const { id, error } of results) {
      await db
        .update(mcpServers)
        .set(
          error === undefined ? { lastError: null, lastUsedAt: new Date() } : { lastError: error },
        )
        .where(eq(mcpServers.id, id));
    }
  },

  async forRun(userId: string, agent: Exclude<McpTarget, "all">): Promise<RunMcpServer[]> {
    const rows = await db
      .select()
      .from(mcpServers)
      .where(
        and(
          eq(mcpServers.userId, userId),
          eq(mcpServers.enabled, true),
          inArray(mcpServers.target, ["all", agent]),
        ),
      )
      .orderBy(asc(mcpServers.name));
    return rows.flatMap((row) => {
      try {
        return [
          {
            id: row.id,
            name: row.name,
            url: row.url,
            headers: unsealed(row.headers),
            allowLocal: row.allowLocal,
          },
        ];
      } catch (error) {
        console.warn(`MCP server ${row.id} is left out of a run:`, error);
        return [];
      }
    });
  },
};
