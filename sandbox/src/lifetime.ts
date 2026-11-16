import type { SandboxLifetime } from "./types";

const RECHECK_MS = 2 * 60_000;

const MARGIN_MS = 5 * 60_000;

export function createSandboxLifetime(): SandboxLifetime {
  const stopsAt = new Map<string, number>();

  return {
    woke(runtimeId, started, autoStopMs, now = Date.now()) {
      stopsAt.set(runtimeId, now + (started ? Math.max(autoStopMs - MARGIN_MS, 0) : RECHECK_MS));
    },

    stopped(runtimeId, now = Date.now()) {
      stopsAt.set(runtimeId, now);
    },

    mayHaveStopped(runtimeId, now = Date.now()) {
      const at = stopsAt.get(runtimeId);

      return at !== undefined && now >= at;
    },
  };
}
