import { runnerFor } from "../runtimes/ask-runner";
import type { RuntimeHub } from "../runtimes/hub";
import type { ViewerSink } from "../runtimes/viewer-streams";

// A shell in a thread's sandbox, run by the runner that hosts it (decision 0053). Every call
// starts from a thread of the caller's organization.
export function createTerminalService(hub: RuntimeHub) {
  const runner = runnerFor(hub);

  return {
    async open(
      organizationId: string,
      threadId: string,
      size: { cols: number; rows: number },
      sink: ViewerSink,
    ) {
      const connection = await runner.connection(organizationId, threadId);
      return connection.openTerminal(threadId, size, sink);
    },
  };
}
