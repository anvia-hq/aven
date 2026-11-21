import { runnerFor } from "../runtimes/ask-runner";
import type { RuntimeHub } from "../runtimes/hub";
import { threadDiff } from "./schema";
import type { DiffResult } from "./types";
import type { DiffGetParams, DiffScope } from "@aven/protocol/types";

const refusal = { logged: "The diff was refused:", message: "The changes could not be read" };

export function createDiffService(hub: RuntimeHub) {
  const runner = runnerFor(hub);
  const inFlight = new Map<string, { token: symbol; promise: Promise<DiffResult> }>();

  function ask(organizationId: string, params: DiffGetParams): Promise<DiffResult> {
    const key = `${organizationId}:${params.threadId}:${params.scope}:${params.summaryOnly ? "s" : ""}:${params.branchOnly ? "b" : ""}`;
    const existing = inFlight.get(key);

    if (existing) return existing.promise;

    const token = Symbol();
    const promise = runner
      .ask(organizationId, "diff.get", params, threadDiff, refusal)
      .then((diff): DiffResult => (diff ? { available: true, ...diff } : { available: false }))
      .finally(() => {
        if (inFlight.get(key)?.token === token) inFlight.delete(key);
      });
    inFlight.set(key, { token, promise });
    return promise;
  }

  return {
    get(
      organizationId: string,
      threadId: string,
      scope: DiffScope,
      options?: { summaryOnly?: boolean },
    ): Promise<DiffResult> {
      const params: DiffGetParams = options?.summaryOnly
        ? { threadId, scope, summaryOnly: true }
        : { threadId, scope };
      return ask(organizationId, params);
    },

    async branch(organizationId: string, threadId: string): Promise<string | null> {
      const diff = await ask(organizationId, { threadId, scope: "all", branchOnly: true });
      return diff.available ? (diff.branch ?? null) : null;
    },
  };
}
