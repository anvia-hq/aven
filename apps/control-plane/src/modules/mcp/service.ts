import { db } from "@aven/db/client";
import { mcpServers, type McpServerRow } from "@aven/db/schema/mcp-servers";
import { MCP_LIMIT, mcpSlug, type McpTarget } from "@aven/protocol/mcp";
import type { McpConnectResult, RunMcpServer } from "@aven/protocol/runtime-wire";
import { and, asc, count, eq, inArray } from "drizzle-orm";

import { decryptOrUnavailable, encryptSecret } from "../../crypto";
import { ConflictError, UnprocessableError } from "../../errors";
import type { CreateMcpBody, UpdateMcpBody } from "./schema";

// What the API returns: the headers' names, never their values.
export type McpServerView = Omit<McpServerRow, "headers" | "userId">;

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

// Postgres says a unique index was broken with this code, which Drizzle wraps as the `cause` of its
// own error; two names that come to one slug are one server.
const isDuplicate = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) return false;
  if ("code" in error && error.code === "23505") return true;
  return "cause" in error && isDuplicate(error.cause);
};

const SAME_NAME = "You already have an MCP server with that name";

// A person's MCP servers (decision 0085): remote servers their agents use as tools. Tied to the
// user, not to a workspace, like skills and providers.
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

  // Null when it is not the user's. Headers replace the set; a header sent without a value keeps
  // the one it has (the values are never read back to the person).
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
    // What was wrong with the old address or headers is not known to be wrong now.
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

  // How a run's servers connected, for the person to see in Settings: the reason one did not, or
  // that it did and when. The ids are those the run was given, which the caller has checked.
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

  // The servers a run's agents use: the enabled ones that are for this kind of agent, with their
  // headers in the clear, for the runner to keep in memory for the run. A server whose headers
  // cannot be read is left out and said so in the log.
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
