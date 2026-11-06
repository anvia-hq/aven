// Timing of what happens before a run's first token, for finding out where a slow start spends its
// time (decision 0119). Off unless AVEN_TIMING is set: a mark is a line of log per run, and the
// control plane and the runner both write them, so one thread's start can be read end to end.

export type Timing = {
  /**
   * Notes that a step has ended, printing what it took since the mark before it and since the
   * clock started. A step that is still going when the run ends is not printed.
   */
  mark(step: string): void;
};

const quiet: Timing = { mark: () => undefined };

/** Whether timings are asked for. Read each time, so a test may turn them on. */
export const timingWanted = () => Boolean(process.env.AVEN_TIMING);

/** A clock for one thing being timed, named so its lines can be told apart. */
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
