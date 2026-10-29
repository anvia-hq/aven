import type { MemoryStore, Message } from "@anvia/core";
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

// Anthropic binds each thinking block's signature to the conversation it was produced in: the
// tools, the system prompt and every message before it. A later run replays that history, and
// the API rejects a block whose conversation no longer matches exactly (docs/bugs/0001). Earlier
// thinking is not needed to continue, so it is left out of the history a run starts from. The
// run's own tool loop keeps its thinking in memory, because history is loaded once, at run start.
function withoutReasoning(message: Message): Message[] {
  if (message.role !== "assistant" || typeof message.content === "string") return [message];
  const content = message.content.filter((part) => part.type !== "reasoning");
  if (content.length === message.content.length) return [message];
  // An assistant message of nothing but thinking would be an empty turn.
  return content.length > 0 ? [{ ...message, content }] : [];
}

export function withoutStoredReasoning(store: MemoryStore): MemoryStore {
  return {
    inspector: store.inspector,
    compaction: store.compaction,
    load: async (options) => (await store.load(options)).flatMap(withoutReasoning),
    append: (options) => store.append(options),
    clear: (options) => store.clear(options),
    recordError: store.recordError?.bind(store),
  };
}
