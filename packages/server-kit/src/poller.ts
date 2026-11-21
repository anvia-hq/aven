import type { Poller } from "./types";

export function createPoller({
  intervalMs,
  run,
  onError,
  immediate = true,
}: {
  intervalMs: number;
  run: () => Promise<void> | void;
  onError: (error: unknown) => void;
  immediate?: boolean;
}): Poller {
  let timer: ReturnType<typeof setInterval> | undefined;
  let inFlight: Promise<void> | undefined;

  async function tick() {
    if (inFlight) return inFlight;

    inFlight = (async () => {
      try {
        await run();
      } catch (error) {
        onError(error);
      } finally {
        inFlight = undefined;
      }
    })();
    return inFlight;
  }

  return {
    tick,
    start() {
      if (timer) return;

      if (immediate) void tick();

      timer = setInterval(() => void tick(), intervalMs);
      timer.unref();
    },
    async close() {
      if (timer) clearInterval(timer);

      timer = undefined;
      await inFlight;
    },
  };
}
