import { describeError } from "@aven/server-kit/errors";
import { EXTEND_EVERY_MS, idleWindows, shouldStopSandbox } from "@aven/sandbox/idle";
import { runtimeActivity } from "./activity";
import { extendCloudRuntime, stopCloudRuntime } from "./providers";
import { runtimesService } from "./service";
import type { CloudSandboxThread, IdleWindows } from "@aven/sandbox/types";
import type { RuntimeHub } from "./hub";

const SANDBOX_PAGE = 200;

type Options = {
  intervalMs: number;
  hub: Pick<RuntimeHub, "get">;
  running: (threadId: string) => boolean;
  lastEventAt: (threadId: string) => number | undefined;
  windows?: IdleWindows;
  pageSize?: number;
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
  pageSize = SANDBOX_PAGE,
  now = Date.now,
  stop = stopCloudRuntime,
  extend = extendCloudRuntime,
}: Options) {
  const seen = new Map<string, { since: number; extendedAt: number }>();
  let timer: ReturnType<typeof setInterval> | undefined;
  let ticking: Promise<unknown> | undefined;

  async function visit(runtimeId: string, threads: CloudSandboxThread[], at: number) {
    if (!hub.get(runtimeId)) {
      seen.delete(runtimeId);
      return false;
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
        return true;
      } catch (error) {
        known.extendedAt = at;
        console.warn(
          `Could not stop the idle Aven Cloud computer ${runtimeId}:`,
          describeError(error),
        );
        return false;
      }
    }

    if (at - known.extendedAt < EXTEND_EVERY_MS) return false;

    known.extendedAt = at;

    await extend(runtimeId).catch((error: unknown) =>
      console.warn(`Could not extend the Aven Cloud computer ${runtimeId}:`, describeError(error)),
    );

    return false;
  }

  async function sweep(at = now()) {
    const visited = new Set<string>();
    let stopped = 0;
    let after: string | undefined;

    for (;;) {
      const page = await runtimesService.liveCloudSandboxes({ limit: pageSize, after });

      for (const [runtimeId, threads] of grouped(page.threads)) {
        visited.add(runtimeId);

        if (await visit(runtimeId, threads, at)) stopped += 1;
      }

      const last = page.sandboxIds.at(-1);

      if (page.sandboxIds.length < pageSize || last === undefined) break;

      after = last;
    }

    for (const runtimeId of seen.keys()) if (!visited.has(runtimeId)) seen.delete(runtimeId);

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
