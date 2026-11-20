import { cloudSandboxStore } from "../cloud-lifecycle/sandbox-store";
import { threadsService } from "../threads/service";

const CACHED_THREADS = 1000;

const FLUSH_INTERVAL_MS = 30_000;

const byRuntime = new Map<string, number>();

const flushedAt = new Map<string, number>();

const runtimeOfThread = new Map<string, string>();

function persist(runtimeId: string, now: number, dirty: boolean) {
  const last = flushedAt.get(runtimeId) ?? 0;

  if (!dirty && now - last < FLUSH_INTERVAL_MS) return;

  flushedAt.set(runtimeId, now);
  void cloudSandboxStore.recordActivity(runtimeId, new Date(now), dirty).catch(() => undefined);
}

export const runtimeActivity = {
  async touchThread(threadId: string, now = Date.now(), dirty = false) {
    const known = runtimeOfThread.get(threadId);
    const runtimeId = known ?? (await threadsService.runtimeOf(threadId));

    if (!runtimeId) return;

    if (runtimeOfThread.size >= CACHED_THREADS) runtimeOfThread.clear();

    runtimeOfThread.set(threadId, runtimeId);
    byRuntime.set(runtimeId, now);
    persist(runtimeId, now, dirty);
  },

  touch(runtimeId: string, now = Date.now(), dirty = false) {
    byRuntime.set(runtimeId, now);
    persist(runtimeId, now, dirty);
  },

  lastAt(runtimeId: string) {
    return byRuntime.get(runtimeId);
  },

  forget(runtimeId: string) {
    byRuntime.delete(runtimeId);
    flushedAt.delete(runtimeId);
  },
};
