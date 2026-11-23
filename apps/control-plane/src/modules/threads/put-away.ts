import { describeError } from "@aven/server-kit/errors";
import { cloudSandboxStore } from "../cloud-lifecycle/sandbox-store";
import type { RuntimeHub } from "../runtimes/hub";
import { releaseThread, stopCloudRuntime } from "../runtimes/providers";
import type { PutAwayThread } from "./types";

export function createPutAwayThread({
  cancel,
  hub,
  openThreads,
  stop = stopCloudRuntime,
  reclaim = (runtimeId) => cloudSandboxStore.expireStoppedNow(runtimeId),
}: {
  cancel: (threadId: string) => unknown;
  hub: Pick<RuntimeHub, "get">;
  openThreads: (runtimeId: string) => Promise<number>;
  stop?: (runtimeId: string) => Promise<void>;
  reclaim?: (runtimeId: string) => Promise<void>;
}): PutAwayThread {
  return (thread) => {
    cancel(thread.id);
    void releaseThread(hub, { runtimeId: thread.runtimeId, threadId: thread.id }).catch(
      (error: unknown) =>
        console.warn(`Could not free the sandbox of thread ${thread.id}:`, describeError(error)),
    );
    void (async () => {
      if ((await openThreads(thread.runtimeId)) > 0) return;

      await stop(thread.runtimeId);
      await reclaim(thread.runtimeId);
    })().catch((error: unknown) =>
      console.warn(
        `Could not stop the sandbox of runtime ${thread.runtimeId}:`,
        describeError(error),
      ),
    );
  };
}
