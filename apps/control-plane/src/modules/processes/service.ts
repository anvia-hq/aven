import type { ProcessLogs, ProcessView } from "@aven/protocol/runtime-wire";

import { runnerFor } from "../runtimes/ask-runner";
import type { RuntimeHub } from "../runtimes/hub";
import { logsAnswer, processesAnswer } from "./schema";

export type ProcessesResult = { processes: ProcessView[] };

// The processes the agent left running in a thread's sandbox, seen and stopped through the runner
// that holds it (decision 0071). Every call starts from a thread of the caller's organization.
export function createProcessesService(hub: RuntimeHub) {
  const runner = runnerFor(hub);
  return {
    // A sandbox that is not up has none; the runner does not start it to look.
    async list(organizationId: string, threadId: string): Promise<ProcessesResult> {
      return runner.ask(organizationId, "processes.list", { threadId }, processesAnswer, {
        logged: "The processes.list call was refused:",
        message: "The processes could not be read",
      });
    },

    async stop(
      organizationId: string,
      threadId: string,
      processId: string,
    ): Promise<ProcessesResult> {
      return runner.ask(
        organizationId,
        "processes.stop",
        { threadId, processId },
        processesAnswer,
        {
          logged: "The processes.stop call was refused:",
          message: "The process could not be stopped",
        },
      );
    },

    async logs(organizationId: string, threadId: string, processId: string): Promise<ProcessLogs> {
      return runner.ask(organizationId, "processes.logs", { threadId, processId }, logsAnswer, {
        logged: "The processes.logs call was refused:",
        message: "The process output could not be read",
      });
    },
  };
}
