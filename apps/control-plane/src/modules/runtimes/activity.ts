import { threadsService } from "../threads/service";

const CACHED_THREADS = 1000;

const byRuntime = new Map<string, number>();

const runtimeOfThread = new Map<string, string>();

export const runtimeActivity = {
  async touchThread(threadId: string, now = Date.now()) {
    const known = runtimeOfThread.get(threadId);
    const runtimeId = known ?? (await threadsService.runtimeOf(threadId));

    if (!runtimeId) return;

    if (runtimeOfThread.size >= CACHED_THREADS) runtimeOfThread.clear();

    runtimeOfThread.set(threadId, runtimeId);
    byRuntime.set(runtimeId, now);
  },

  touch(runtimeId: string, now = Date.now()) {
    byRuntime.set(runtimeId, now);
  },

  lastAt(runtimeId: string) {
    return byRuntime.get(runtimeId);
  },

  forget(runtimeId: string) {
    byRuntime.delete(runtimeId);
  },
};
