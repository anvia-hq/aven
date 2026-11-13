import { describeError } from "@aven/server-kit/errors";
import type { RuntimeHub } from "../runtimes/hub";
import { releaseThread } from "../runtimes/providers";
import type { ProviderOf } from "../runtimes/types";
import type { PutAwayThread } from "./types";

export function createPutAwayThread({
  cancel,
  hub,
  providerOf,
}: {
  cancel: (threadId: string) => unknown;
  hub: Pick<RuntimeHub, "get">;
  providerOf?: ProviderOf;
}): PutAwayThread {
  return (thread) => {
    cancel(thread.id);
    void releaseThread(hub, { runtimeId: thread.runtimeId, threadId: thread.id }, providerOf).catch(
      (error: unknown) =>
        console.warn(`Could not free the sandbox of thread ${thread.id}:`, describeError(error)),
    );
  };
}
