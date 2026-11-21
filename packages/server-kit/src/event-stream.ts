const DEFAULT_PING_MS = 15_000;

export async function* followStream<T>({
  attach,
  initial,
  signal,
  pingMs = DEFAULT_PING_MS,
}: {
  attach: (push: (item: T) => void) => () => void;
  initial: (queue: T[]) => Promise<T> | T;
  signal: AbortSignal;
  pingMs?: number;
}): AsyncGenerator<T | null> {
  const queue: T[] = [];
  let wake: (() => void) | undefined;
  const detach = attach((item) => {
    queue.push(item);
    wake?.();
  });
  const aborted = new Promise<undefined>((resolve) => {
    if (signal.aborted) {
      resolve(undefined);
      return;
    }

    signal.addEventListener("abort", () => resolve(undefined), { once: true });
  });
  try {
    yield await initial(queue);
    while (!signal.aborted) {
      const item = queue.shift();

      if (item !== undefined) {
        yield item;
        continue;
      }

      const timer = Bun.sleep(pingMs).then(() => null);
      const arrived = new Promise<undefined>((resolve) => {
        wake = () => resolve(undefined);
      });
      const woke = await Promise.race([arrived, aborted, timer]);
      wake = undefined;

      if (woke === null && queue.length === 0 && !signal.aborted) yield null;
    }
  } finally {
    detach();
  }
}
