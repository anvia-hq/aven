import type { CockpitActivity } from "@aven/protocol/types";

const PING_MS = 20_000;

const watchers = new Map<string, Set<(activity: CockpitActivity) => void>>();

export const cockpitPulses = {
  publish(userId: string, activity: CockpitActivity) {
    for (const listener of watchers.get(userId) ?? []) {
      listener(activity);
    }
  },

  async *watch(userId: string, signal: AbortSignal): AsyncGenerator<CockpitActivity | null> {
    const queue: CockpitActivity[] = [];
    let wake: (() => void) | undefined;
    let detach: (() => void) | undefined;

    try {
      const listening = watchers.get(userId) ?? new Set<(activity: CockpitActivity) => void>();
      watchers.set(userId, listening);
      const listener = (activity: CockpitActivity) => {
        queue.push(activity);
        wake?.();
      };
      listening.add(listener);
      detach = () => {
        listening.delete(listener);

        if (listening.size === 0) watchers.delete(userId);
      };
      const aborted = new Promise<undefined>((resolve) => {
        signal.addEventListener("abort", () => resolve(undefined), { once: true });
      });

      while (!signal.aborted) {
        const activity = queue.shift();

        if (activity) {
          yield activity;
          continue;
        }

        const timer = Bun.sleep(PING_MS).then(() => null);
        const arrived = new Promise<undefined>((resolve) => {
          wake = () => resolve(undefined);
        });
        const woke = await Promise.race([arrived, aborted, timer]);
        wake = undefined;

        if (woke === null && queue.length === 0 && !signal.aborted) yield null;
      }
    } finally {
      detach?.();
    }
  },
};
