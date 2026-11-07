import type { Clock } from "./types";

export const MAX_WAIT_SECONDS = 240;

export const realClock: Clock = {
  now: () => Date.now(),
  sleep: (ms, abortSignal) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, ms);
      abortSignal?.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          reject(abortSignal.reason);
        },
        { once: true },
      );
    }),
};
