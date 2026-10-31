import { ForbiddenError } from "../../errors";
import { runnerFor, type Runner } from "../runtimes/ask-runner";
import type { RuntimeHub } from "../runtimes/hub";
import type { ViewerSink } from "../runtimes/viewer-streams";
import { threadsService } from "../threads/service";

// A shell in a sandbox, run by the runner that hosts it (decision 0053): a thread's, or a bot's
// (decision 0059). `requireShell` says whether this person may have it, before any socket is
// upgraded; `scope` is whose the computer is, as `runner` finds computers by it.
export function createTerminalService(
  runner: Runner,
  requireShell: (scope: string, userId: string, id: string) => Promise<void>,
) {
  return {
    requireShell,

    async open(scope: string, id: string, size: { cols: number; rows: number }, sink: ViewerSink) {
      const connection = await runner.connection(scope, id);
      return connection.openTerminal(id, size, sink);
    },
  };
}

// The shell sees what the latest run was given: its sender's GitHub account and personal variables.
// Only that person gets in; before any run, the thread's creator. A thread of another organization
// is not found.
export async function requireThreadShell(organizationId: string, userId: string, threadId: string) {
  const thread = await threadsService.require(organizationId, threadId);
  if ((thread.lastRunBy ?? thread.createdBy) !== userId) {
    throw new ForbiddenError("Only the person the thread last ran as has its terminal");
  }
}

export const threadTerminalService = (hub: RuntimeHub) =>
  createTerminalService(runnerFor(hub), requireThreadShell);
