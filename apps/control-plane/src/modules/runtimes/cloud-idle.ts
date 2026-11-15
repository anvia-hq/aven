import { describeError } from "@aven/server-kit/errors";
import { EXTEND_EVERY_MS, idleWindows, shouldStopSandbox } from "@aven/sandbox/idle";
import { runtimeActivity } from "./activity";
import { extendCloudRuntime, stopCloudRuntime } from "./providers";
import { runtimesService } from "./service";
import type { CloudSandboxThread, IdleWindows } from "@aven/sandbox/types";
import type { RuntimeHub } from "./hub";

type Options = {
  intervalMs: number;
  hub: Pick<RuntimeHub, "get">;
  running: (threadId: string) => boolean;
  lastEventAt: (threadId: string) => number | undefined;
  windows?: IdleWindows;
  now?: () => number;
  stop?: (runtimeId: string) => Promise<void>;
  extend?: (runtimeId: string) => Promise<void>;
};

function grouped(rows: CloudSandboxThread[]) {
  const byRuntime = new Map<string, CloudSandboxThread[]>();

  for (const row of rows) {
    const threads = byRuntime.get(row.runtimeId);

    if (threads) threads.push(row);
    else byRuntime.set(row.runtimeId, [row]);
  }

  return byRuntime;
}

export function createCloudIdle({
  intervalMs,
  hub,
  running,
  lastEventAt,
  windows = idleWindows(),
  now = Date.now,
  stop = stopCloudRuntime,
  extend = extendCloudRuntime,
}: Options) {
  const seen = new Map<string, { since: number; extendedAt: number }>();
  let timer: ReturnType<typeof setInterval> | undefined;
  let ticking: Promise<unknown> | undefined;

  async function sweep(at = now()) {
    const sandboxes = grouped(await runtimesService.liveCloudSandboxes());
    let stopped = 0;

    for (const [runtimeId, threads] of sandboxes) {
      if (!hub.get(runtimeId)) {
        seen.delete(runtimeId);
        continue;
      }

      const known = seen.get(runtimeId) ?? { since: at, extendedAt: 0 };
      seen.set(runtimeId, known);

      const agentRunning = threads.some((thread) => running(thread.threadId));
      const lastAgentAt = threads.reduce(
        (latest, thread) =>
          Math.max(latest, thread.updatedAt.getTime(), lastEventAt(thread.threadId) ?? 0),
        0,
      );
      const lastUserAt = Math.max(lastAgentAt, known.since, runtimeActivity.lastAt(runtimeId) ?? 0);

      if (shouldStopSandbox({ windows, now: at, lastAgentAt, lastUserAt, agentRunning })) {
        try {
          await stop(runtimeId);
          runtimeActivity.forget(runtimeId);
          seen.delete(runtimeId);
          stopped += 1;
        } catch (error) {
          known.extendedAt = at;
          console.warn(
            `Could not stop the idle Aven Cloud computer ${runtimeId}:`,
            describeError(error),
          );
        }

        continue;
      }

      if (at - known.extendedAt < EXTEND_EVERY_MS) continue;

      known.extendedAt = at;

      await extend(runtimeId).catch((error: unknown) =>
        console.warn(
          `Could not extend the Aven Cloud computer ${runtimeId}:`,
          describeError(error),
        ),
      );
    }

    for (const runtimeId of seen.keys()) if (!sandboxes.has(runtimeId)) seen.delete(runtimeId);

    return stopped;
  }

  const guarded = () => {
    if (ticking) return;

    ticking = sweep()
      .catch((error: unknown) =>
        console.warn("A sweep for idle Aven Cloud computers failed:", describeError(error)),
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
