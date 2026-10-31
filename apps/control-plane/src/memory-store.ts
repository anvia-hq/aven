import { db } from "@aven/db/client";
import {
  DrizzleMemoryStore,
  drizzleMemorySchema,
  type DrizzleMemoryDatabaseLike,
} from "@anvia/memory-drizzle";

// Durable conversation memory in our Postgres (tables live in @aven/db, schema/anvia-memory.ts).
//
// Sessions are keyed by `sessionId` plus `metadata.organizationId`, so a thread id from another
// organization can never resolve to this one's history. Pass both on every call.
export function createMemoryStore(database: DrizzleMemoryDatabaseLike) {
  return new DrizzleMemoryStore({
    db: database,
    schema: drizzleMemorySchema,
    scopeKey: { metadataKeys: ["organizationId"] },
  });
}

// A bot's conversation (decision 0058) is in the same tables, under the bot's id and its owner's:
// bots belong to a person, not to an organization.
export function createBotMemoryStore(database: DrizzleMemoryDatabaseLike) {
  return new DrizzleMemoryStore({
    db: database,
    schema: drizzleMemorySchema,
    scopeKey: { includeUserId: true },
  });
}

export type ConversationStore = ReturnType<typeof createMemoryStore>;

// The conversations live in Postgres and are read by the run manager (history) and written by the
// runtime hub (a runner's calls), so both share one store.
export const memoryStore = createMemoryStore(db);
export const botMemoryStore = createBotMemoryStore(db);
