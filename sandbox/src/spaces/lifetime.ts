const RECHECK_MS = 2 * 60_000;

const MARGIN_MS = 5 * 60_000;

const stopsAt = new Map<string, number>();

export const spacesLifetime = {
  woke(runtimeId: string, started: boolean, autoStopMs: number, now = Date.now()) {
    stopsAt.set(runtimeId, now + (started ? Math.max(autoStopMs - MARGIN_MS, 0) : RECHECK_MS));
  },

  mayHaveStopped(runtimeId: string, now = Date.now()) {
    const at = stopsAt.get(runtimeId);

    return at !== undefined && now >= at;
  },
};
