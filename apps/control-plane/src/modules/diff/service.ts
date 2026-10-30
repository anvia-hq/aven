import type { DiffScope } from "@aven/protocol/runtime-wire";

import { UnavailableError } from "../../errors";
import { RuntimeOfflineError, type RuntimeHub } from "../runtimes/hub";
import { threadsService } from "../threads/service";
import { threadDiff } from "./schema";

export type DiffResult =
  | { available: false }
  | { available: true; patch: string; truncated: boolean };

// What a thread's workspace has changed, read through the runner that holds it (decision 0030).
// The call starts from a thread of the caller's organization.
export function createDiffService(hub: RuntimeHub) {
  return {
    async get(organizationId: string, threadId: string, scope: DiffScope): Promise<DiffResult> {
      const thread = await threadsService.require(organizationId, threadId);
      const connection = hub.get(thread.runtimeId);
      if (!connection) throw new RuntimeOfflineError();
      // The runtime's own reason stays in the log; the client gets a fixed message.
      const answer = await connection
        .call("diff.get", { threadId, scope })
        .catch((error: unknown) => {
          console.warn("The diff was refused:", error instanceof Error ? error.message : error);
          throw new UnavailableError("The changes could not be read");
        });
      const parsed = threadDiff.safeParse(answer);
      if (!parsed.success) throw new UnavailableError("The runtime gave an unexpected answer");
      return parsed.data ? { available: true, ...parsed.data } : { available: false };
    },
  };
}
