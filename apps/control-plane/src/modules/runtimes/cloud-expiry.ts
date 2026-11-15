import { describeError } from "@aven/server-kit/errors";

import { BoatApiError, BoatClient } from "./boat/client";
import { destroySpacesSandbox } from "./providers";
import { runtimesService } from "./service";

const HOUR_MS = 3_600_000;

export const CLOUD_SANDBOX_LIFE_MS = 48 * HOUR_MS;

type Options = {
  intervalMs: number;
  afterMs?: number;
  client?: Pick<BoatClient, "deleteSandbox">;
  destroySpaces?: (sandboxId: string) => Promise<void>;
};

export function createCloudExpiry({
  intervalMs,
  afterMs = CLOUD_SANDBOX_LIFE_MS,
  client = new BoatClient(),
  destroySpaces = destroySpacesSandbox,
}: Options) {
  let timer: ReturnType<typeof setInterval> | undefined;
  let ticking: Promise<unknown> | undefined;

  async function sweep(now = new Date()) {
    const apiKey = process.env.AVEN_BOAT_API_KEY?.trim();
    const idle = await runtimesService.idleCloudSandboxes(new Date(now.getTime() - afterMs));
    let expired = 0;

    for (const { id, provider, sandboxId } of idle) {
      try {
        if (sandboxId && provider === "spaces") {
          await destroySpaces(sandboxId);
        } else if (sandboxId) {
          if (!apiKey) continue;

          await client.deleteSandbox(apiKey, sandboxId).catch((error: unknown) => {
            if (!(error instanceof BoatApiError && error.status === 404)) throw error;
          });
        }

        await runtimesService.expireCloudSandbox(id);
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
