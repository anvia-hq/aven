import { describeError } from "../../errors";
import type { RuntimeHub } from "../runtimes/hub";
import type { PutAwayThread } from "./types";

const RELEASE_TIMEOUT_MS = 30_000;

export function createPutAwayThread({
  cancel,
  hub,
}: {
  cancel: (threadId: string) => unknown;
  hub: RuntimeHub;
}): PutAwayThread {
  return (thread) => {
    cancel(thread.id);
    const runner = hub.get(thread.runtimeId);
    if (!runner) return;
    void runner
      .call("sandbox.release", { threadId: thread.id }, RELEASE_TIMEOUT_MS)
      .catch((error: unknown) =>
        console.warn(`Could not free the sandbox of thread ${thread.id}:`, describeError(error)),
      );
  };
}
