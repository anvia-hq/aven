import type { ContinuationStore } from "../modules/runs/service";

// Where a suspended run's continuation waits, without a database.
export function memoryContinuations() {
  const saved = new Map<string, unknown>();
  const store: ContinuationStore = {
    save: async (threadId, continuation) => void saved.set(threadId, continuation),
    clear: async (threadId) => void saved.delete(threadId),
  };
  return { store, saved };
}
