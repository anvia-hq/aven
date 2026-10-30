import type { DiffScope, ThreadDiff } from "@aven/protocol/runtime-wire";

import { describeError, UnavailableError } from "../../errors";
import { runnerFor, type Available } from "../runtimes/ask-runner";
import type { RuntimeHub } from "../runtimes/hub";
import { threadDiff } from "./schema";

export type DiffResult = Available<ThreadDiff>;

// The runtime's own reason stays in the log; the client gets a fixed message.
const refused = (error: unknown): never => {
  console.warn("The diff was refused:", describeError(error));
  throw new UnavailableError("The changes could not be read");
};

// What a thread's workspace has changed, read through the runner that holds it (decision 0030).
// The call starts from a thread of the caller's organization.
export function createDiffService(hub: RuntimeHub) {
  const runner = runnerFor(hub);
  return {
    async get(organizationId: string, threadId: string, scope: DiffScope): Promise<DiffResult> {
      const params = { threadId, scope };
      const diff = await runner.ask(organizationId, "diff.get", params, threadDiff, refused);
      return diff ? { available: true, ...diff } : { available: false };
    },
  };
}
