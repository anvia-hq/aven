import { createMemoryStore } from "@aven/agents/memory";
import { db } from "@aven/db/client";

// The conversations live in Postgres and are read by the run manager (history) and written by the
// runtime hub (a runner's calls), so both share one store.
export const memoryStore = createMemoryStore(db);
