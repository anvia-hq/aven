import type { ContinuationStore, FailureStore } from "../modules/runs/service";

// Where a suspended run's continuation waits, without a database.
export function memoryContinuations() {
  const saved = new Map<string, unknown>();
  const store: ContinuationStore = {
    save: async (threadId, continuation) => void saved.set(threadId, continuation),
    clear: async (threadId) => void saved.delete(threadId),
  };
  return { store, saved };
}

// The failures of runs in memory, as the threads table keeps them (decision 0100).
export function memoryFailures() {
  const saved = new Map<string, string>();
  const store: FailureStore = {
    record: async (threadId, message) =>
      void (message === null ? saved.delete(threadId) : saved.set(threadId, message)),
    read: async (threadId) => saved.get(threadId) ?? null,
  };
  return { store, saved };
}
