export type Timing = {
  mark(step: string): void;
};

const quiet: Timing = { mark: () => undefined };

export const timingWanted = () => Boolean(process.env.AVEN_TIMING);

export function timing(label: string): Timing {
  if (!timingWanted()) return quiet;
  const start = performance.now();
  let last = start;
  return {
    mark(step) {
      const now = performance.now();
      const took = Math.round(now - last);
      last = now;
      console.log(`[timing] ${label} ${step} ${took}ms (${Math.round(now - start)}ms)`);
    },
  };
}
