import { db } from "@aven/db/client";
import {
  DrizzleMemoryStore,
  drizzleMemorySchema,
  type DrizzleMemoryDatabaseLike,
} from "@anvia/memory-drizzle";

export function createMemoryStore(database: DrizzleMemoryDatabaseLike) {
  return new DrizzleMemoryStore({
    db: database,
    schema: drizzleMemorySchema,
    scopeKey: { metadataKeys: ["organizationId"] },
  });
}

export function createBotMemoryStore(database: DrizzleMemoryDatabaseLike) {
  return new DrizzleMemoryStore({
    db: database,
    schema: drizzleMemorySchema,
    scopeKey: { includeUserId: true },
  });
}

export const memoryStore = createMemoryStore(db);
export const botMemoryStore = createBotMemoryStore(db);
