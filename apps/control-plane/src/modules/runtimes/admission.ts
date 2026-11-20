import { UnavailableError } from "@aven/server-kit/errors";

import { cloudLifecycleService } from "../cloud-lifecycle/service";
import { spendBrakeService } from "../cloud-lifecycle/spend";
import { editionInUse } from "../../edition/current";
import { computerUsageService } from "./computer-usage";
import type { AdmissionOptions, ComputerStart } from "./types";

const POLL_MS = 2_000;

const MAX_WAIT_MS = 60_000;

const MINUTE_MS = 60_000;

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const minutesOf = (ms: number) => Math.max(1, Math.ceil(ms / MINUTE_MS));

export function createAdmission({
  settings,
  running,
  spend,
  extra,
  now = Date.now,
  sleep = pause,
  pollMs = POLL_MS,
  maxWaitMs = MAX_WAIT_MS,
}: AdmissionOptions) {
  const buckets = new Map<string, { tokens: number; at: number }>();

  async function waitForRoom(start: ComputerStart, limit: number) {
    if (start.organizationId === null) return;

    const deadline = now() + maxWaitMs;

    while ((await running(start.organizationId, start.runtimeId)) >= limit) {
      if (now() + pollMs > deadline) {
        throw new UnavailableError(
          `This workspace has ${limit} Aven Cloud computers running. Try again when one has stopped`,
        );
      }

      await sleep(pollMs);
    }
  }

  async function takeStart(start: ComputerStart, burst: number, everyMinutes: number) {
    if (start.userId === null) return;

    const refillMs = everyMinutes * MINUTE_MS;
    const at = now();
    const bucket = buckets.get(start.userId) ?? { tokens: burst, at };
    const tokens = Math.min(burst, bucket.tokens + (at - bucket.at) / refillMs);
    const waitMs = tokens >= 1 ? 0 : Math.ceil((1 - tokens) * refillMs);

    if (waitMs > maxWaitMs) {
      throw new UnavailableError(
        `You have started ${burst} Aven Cloud computers in a row. The next can start in about ${minutesOf(waitMs)} minutes`,
      );
    }

    buckets.set(start.userId, { tokens: tokens - 1, at });

    if (waitMs > 0) await sleep(waitMs);
  }

  return {
    async admit(start: ComputerStart) {
      if (spend) {
        const verdict = await spend();

        if (verdict.state === "hard_stop") {
          throw new UnavailableError(
            "Aven Cloud reached its monthly spend limit. Raise the budget in Settings > Sandbox or wait for the next billing period",
          );
        }
      }

      const limits = await settings();

      if (limits.maxRunning !== null) await waitForRoom(start, limits.maxRunning);

      if (limits.startBurst !== null)
        await takeStart(start, limits.startBurst, limits.startEveryMinutes);

      await extra?.(start);
    },
  };
}

export const admission = createAdmission({
  settings: () => cloudLifecycleService.current(),
  running: (organizationId, exceptRuntimeId) =>
    computerUsageService.runningIn(organizationId, exceptRuntimeId),
  spend: () => spendBrakeService.verdict(),
  extra: (start) => editionInUse.current.admit?.(start) ?? Promise.resolve(),
});
