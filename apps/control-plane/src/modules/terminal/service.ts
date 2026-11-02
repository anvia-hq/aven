import { ForbiddenError } from "../../errors";
import { runnerFor } from "../runtimes/ask-runner";
import type { RuntimeHub } from "../runtimes/hub";
import type { ViewerSink } from "../runtimes/viewer-streams";
import { threadsService } from "../threads/service";

// A shell in a thread's sandbox, run by the runner that hosts it (decision 0053). Every call
// starts from a thread of the caller's organization.
export function createTerminalService(hub: RuntimeHub) {
  const runner = runnerFor(hub);

  return {
    // The shell sees what the latest run was given: its sender's GitHub account and personal
    // variables. Only that person gets in, and only a thread's creator can send a run (decision
    // 0084), so this is the creator, unless a run was sent as someone else before then.
    async requireShell(organizationId: string, userId: string, threadId: string) {
      const thread = await threadsService.owned({ organizationId, userId }, threadId);
      if ((thread.lastRunBy ?? thread.createdBy) !== userId) {
        throw new ForbiddenError("Only the person the thread last ran as has its terminal");
      }
    },

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
