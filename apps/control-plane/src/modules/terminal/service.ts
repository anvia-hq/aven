import { ForbiddenError } from "../../errors";
import { runnerFor } from "../runtimes/ask-runner";
import type { RuntimeHub } from "../runtimes/hub";
import { threadsService } from "../threads/service";
import type { ViewerSink } from "../runtimes/types";

export function createTerminalService(hub: RuntimeHub) {
  const runner = runnerFor(hub);

  return {
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
