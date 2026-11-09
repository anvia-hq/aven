import type { ContinuationStore, FailureStore, WorkedTimeStore } from "../modules/runs/types";

export function memoryContinuations() {
  const saved = new Map<string, unknown>();
  const store: ContinuationStore = {
    save: async (threadId, continuation) => void saved.set(threadId, continuation),
    clear: async (threadId) => void saved.delete(threadId),
  };
  return { store, saved };
}

export function memoryFailures() {
  const saved = new Map<string, string>();
  const store: FailureStore = {
    record: async (threadId, message) =>
      void (message === null ? saved.delete(threadId) : saved.set(threadId, message)),
    read: async (threadId) => saved.get(threadId) ?? null,
  };
  return { store, saved };
}

export function memoryWorkedTimes() {
  const saved = new Map<string, Map<number, number>>();
  const store: WorkedTimeStore = {
    record: async (threadId, index, ms) => {
      saved.set(threadId, (saved.get(threadId) ?? new Map()).set(index, ms));
    },
    read: async (threadId) => new Map(saved.get(threadId) ?? []),
  };
  return { store, saved };
}
