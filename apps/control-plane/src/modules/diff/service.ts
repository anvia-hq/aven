import type { DiffScope, ThreadDiff } from "@aven/protocol/runtime-wire";

import { runnerFor, type Available } from "../runtimes/ask-runner";
import type { RuntimeHub } from "../runtimes/hub";
import { threadDiff } from "./schema";

export type DiffResult = Available<ThreadDiff>;

const refusal = { logged: "The diff was refused:", message: "The changes could not be read" };

// What a thread's workspace has changed, read through the runner that holds it (decision 0030).
// The call starts from a thread of the caller's organization.
export function createDiffService(hub: RuntimeHub) {
  const runner = runnerFor(hub);
  return {
    async get(organizationId: string, threadId: string, scope: DiffScope): Promise<DiffResult> {
      const params = { threadId, scope };
      const diff = await runner.ask(organizationId, "diff.get", params, threadDiff, refusal);
      return diff ? { available: true, ...diff } : { available: false };
    },
  };
}
