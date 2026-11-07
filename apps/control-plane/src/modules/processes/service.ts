import type { ProcessLogs } from "@aven/protocol/runtime-wire";

import { runnerFor } from "../runtimes/ask-runner";
import type { RuntimeHub } from "../runtimes/hub";
import { logsAnswer, processesAnswer } from "./schema";
import type { ProcessesResult } from "./types";

export function createProcessesService(hub: RuntimeHub) {
  const runner = runnerFor(hub);
  return {
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
