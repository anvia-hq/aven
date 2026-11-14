import { describeError } from "@aven/server-kit/errors";
import type { RuntimeHub } from "../runtimes/hub";
import { releaseThread } from "../runtimes/providers";
import type { PutAwayThread } from "./types";

export function createPutAwayThread({
  cancel,
  hub,
}: {
  cancel: (threadId: string) => unknown;
  hub: Pick<RuntimeHub, "get">;
}): PutAwayThread {
  return (thread) => {
    cancel(thread.id);
    void releaseThread(hub, { runtimeId: thread.runtimeId, threadId: thread.id }).catch(
      (error: unknown) =>
        console.warn(`Could not free the sandbox of thread ${thread.id}:`, describeError(error)),
    );
  };
}
