import {
  DrizzleMemoryStore,
  drizzleMemorySchema,
  type DrizzleMemoryDatabaseLike,
} from "@anvia/memory-drizzle";

// Durable conversation memory in our Postgres (tables live in @aven/db, schema/anvia-memory.ts).
// The db is passed in so this package never opens a connection of its own.
//
// Sessions are keyed by `sessionId` plus `metadata.organizationId`, so a thread id from another
// organization can never resolve to this one's history. Pass both on every run:
//   agent.generate({ prompt, session: { sessionId: threadId, metadata: { organizationId } } })
export function createMemoryStore(db: DrizzleMemoryDatabaseLike) {
  return new DrizzleMemoryStore({
    db,
    schema: drizzleMemorySchema,
    scopeKey: { metadataKeys: ["organizationId"] },
  });
}

export type ConversationStore = ReturnType<typeof createMemoryStore>;
