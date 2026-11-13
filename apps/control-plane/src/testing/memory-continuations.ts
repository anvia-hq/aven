import type { PlanLimit } from "@aven/protocol/types";

import type {
  ContinuationStore,
  FailureStore,
  LimitStore,
  SenderStore,
  WorkedTimeStore,
} from "../modules/runs/types";

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
      const times = saved.get(threadId) ?? new Map<number, number>();
      saved.set(threadId, times.set(index, (times.get(index) ?? 0) + ms));
    },
    read: async (threadId) => new Map(saved.get(threadId) ?? []),
  };
  return { store, saved };
}

export function memorySenders() {
  const saved = new Map<string, Map<number, string>>();
  const store: SenderStore = {
    record: async (threadId, index, senderId) => {
      const senders = saved.get(threadId) ?? new Map<number, string>();
      saved.set(threadId, senders.set(index, senderId));
    },
    read: async (threadId) => new Map(saved.get(threadId) ?? []),
  };
  return { store, saved };
}

export function memoryLimits() {
  const saved = new Map<string, PlanLimit[]>();
  const store: LimitStore = {
    record: async (threadId, limits) => {
      const windows = new Set(limits.map((limit) => limit.window));
      const kept = (saved.get(threadId) ?? []).filter((limit) => !windows.has(limit.window));
      saved.set(threadId, kept.concat(limits));
    },
    read: async (threadId) => (saved.get(threadId) ?? []).slice(),
  };
  return { store, saved };
}
