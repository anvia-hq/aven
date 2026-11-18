import { db } from "@aven/db/client";
import type { MemoryAppendOptions } from "@anvia/core/memory";
import {
  DrizzleMemoryStore,
  drizzleMemorySchema,
  type DrizzleMemoryDatabaseLike,
} from "@anvia/memory-drizzle";

import { withoutNul } from "./without-nul";

class NulFreeMemoryStore extends DrizzleMemoryStore {
  override append(input: MemoryAppendOptions) {
    return super.append({ ...input, messages: withoutNul(input.messages) });
  }
}

export function createMemoryStore(database: DrizzleMemoryDatabaseLike) {
  return new NulFreeMemoryStore({
    db: database,
    schema: drizzleMemorySchema,
    scopeKey: { metadataKeys: ["organizationId"] },
  });
}

export function createBotMemoryStore(database: DrizzleMemoryDatabaseLike) {
  return new NulFreeMemoryStore({
    db: database,
    schema: drizzleMemorySchema,
    scopeKey: { includeUserId: true },
  });
}

export const memoryStore = createMemoryStore(db);
export const botMemoryStore = createBotMemoryStore(db);
