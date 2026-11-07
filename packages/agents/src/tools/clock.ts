/** The longest one wait call holds: a model's tool call is not meant to hold for minutes on end. */
export const MAX_WAIT_SECONDS = 240;

export type Clock = {
  now(): number;
  sleep(ms: number, abortSignal?: AbortSignal): Promise<void>;
};

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
