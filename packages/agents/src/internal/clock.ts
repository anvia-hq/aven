import type { Clock } from "../tools/types";

export const MAX_WAIT_SECONDS = 240;

export const realClock: Clock = {
  now: () => Date.now(),
  sleep: (ms, abortSignal) =>
    new Promise((resolve, reject) => {
      if (abortSignal?.aborted) {
        reject(abortSignal.reason);
        return;
      }

      const onAbort = () => {
        clearTimeout(timer);
        reject(abortSignal?.reason);
      };
      const timer = setTimeout(() => {
        abortSignal?.removeEventListener("abort", onAbort);
        resolve();
      }, ms);
      abortSignal?.addEventListener("abort", onAbort, { once: true });
    }),
};
