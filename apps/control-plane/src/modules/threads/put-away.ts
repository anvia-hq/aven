import { describeError } from "../../errors";
import type { RuntimeHub } from "../runtimes/hub";

// How long the control plane waits for a runner to free a sandbox: it frees it all the same, after
// the run that was just stopped has let go of it.
const RELEASE_TIMEOUT_MS = 30_000;

/** What puts a thread away: its run stopped and its sandbox freed. */
export type PutAwayThread = (thread: { id: string; runtimeId: string }) => void;

/**
 * What archiving a thread does besides its state (decision 0118): the run in it is stopped, and its
 * runner is told to free the sandbox, whose files stay. Neither holds the request: a run that is
 * letting go and a runner that is slow are waited for in the background.
 */
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
    // A runner that is not connected has no sandbox to free: a starting one removes its own.
    if (!runner) return;
    void runner
      .call("sandbox.release", { threadId: thread.id }, RELEASE_TIMEOUT_MS)
      .catch((error: unknown) =>
        console.warn(`Could not free the sandbox of thread ${thread.id}:`, describeError(error)),
      );
  };
}
