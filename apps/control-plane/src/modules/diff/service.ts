import { runnerFor } from "../runtimes/ask-runner";
import type { RuntimeHub } from "../runtimes/hub";
import { threadDiff } from "./schema";
import type { DiffResult } from "./types";
import type { DiffScope } from "@aven/protocol/types";

const refusal = { logged: "The diff was refused:", message: "The changes could not be read" };

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
