import { describeError } from "@aven/server-kit/errors";

import type { EnvironmentExpiryOptions } from "./types";

export function createEnvironmentExpiry({ intervalMs, expired, remove }: EnvironmentExpiryOptions) {
  let timer: ReturnType<typeof setInterval> | undefined;
  let ticking: Promise<unknown> | undefined;

  async function sweep(now = new Date()) {
    let forgotten = 0;

    for (const row of await expired(now)) {
      try {
        if (!(await remove(row))) continue;

        forgotten += 1;
      } catch (error) {
        console.warn(
          `Could not forget the environment of project ${row.projectId}:`,
          describeError(error),
        );
      }
    }

    return forgotten;
  }

  const guarded = () => {
    if (ticking) return;

    ticking = sweep()
      .catch((error: unknown) =>
        console.warn("A sweep for expired environments failed:", describeError(error)),
      )
      .finally(() => {
        ticking = undefined;
      });
  };

  return {
    sweep,
    start() {
      if (timer) return;

      guarded();
      timer = setInterval(guarded, intervalMs);
      timer.unref();
    },
    async close() {
      clearInterval(timer);
      timer = undefined;
      await ticking;
    },
  };
}
