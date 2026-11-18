import { describeError } from "@aven/server-kit/errors";

import { cloudSandboxRemover } from "./cloud-config";
import type { CloudExpiryOptions } from "./types";

const HOUR_MS = 3_600_000;

export const CLOUD_SANDBOX_LIFE_MS = 48 * HOUR_MS;

export function createCloudExpiry({
  intervalMs,
  afterMs = CLOUD_SANDBOX_LIFE_MS,
  idle,
  expire,
  remove = cloudSandboxRemover,
}: CloudExpiryOptions) {
  let timer: ReturnType<typeof setInterval> | undefined;
  let ticking: Promise<unknown> | undefined;

  async function sweep(now = new Date()) {
    const life = typeof afterMs === "function" ? await afterMs() : afterMs;
    const stale = await idle(new Date(now.getTime() - life));
    let expired = 0;

    for (const { id, provider, sandboxId } of stale) {
      try {
        if (sandboxId && !(await remove(provider, sandboxId))) continue;

        await expire(id);
        expired += 1;
      } catch (error) {
        console.warn(`Could not expire the Aven Cloud computer ${id}:`, describeError(error));
      }
    }

    return expired;
  }

  const guarded = () => {
    if (ticking) return;

    ticking = sweep()
      .catch((error: unknown) =>
        console.warn("A sweep for expired Aven Cloud computers failed:", describeError(error)),
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
