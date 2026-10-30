import type {
  ArtifactsReadParams,
  DesktopCallParams,
  DiffGetParams,
  FilesCallParams,
  FilesSearchParams,
  RepoPushParams,
  RunnerCallMethod,
} from "@aven/protocol/runtime-wire";
import type { z } from "zod";

import { UnavailableError } from "../../errors";
import { threadsService } from "../threads/service";
import { RuntimeOfflineError, type RuntimeHub } from "./hub";

/** A runner's answer about a thread that may have no workspace or sandbox yet. */
export type Available<T> = { available: false } | ({ available: true } & T);

type CallParams =
  | ArtifactsReadParams
  | DesktopCallParams
  | DiffGetParams
  | FilesCallParams
  | FilesSearchParams
  | RepoPushParams;

// Asking the runner that holds a thread about it (its files, changes, desktop). Every call starts
// from a thread of the caller's organization.
export function runnerFor(hub: RuntimeHub) {
  const connection = async (organizationId: string, threadId: string) => {
    const thread = await threadsService.require(organizationId, threadId);
    const found = hub.get(thread.runtimeId);
    if (!found) throw new RuntimeOfflineError();
    return found;
  };

  return {
    connection,

    // What the runner answers is parsed; a runner that sends something else is as good as offline.
    // `refused` turns the runner's own error into the client's; without it, that error goes through.
    async ask<T>(
      organizationId: string,
      method: RunnerCallMethod,
      params: CallParams,
      schema: z.ZodType<T>,
      refused?: (error: unknown) => never,
      // For a call that takes long, such as starting a container; the default is a few seconds.
      timeoutMs?: number,
    ) {
      const runner = await connection(organizationId, params.threadId);
      const call = runner.call(method, params, timeoutMs);
      const answer = await (refused ? call.catch(refused) : call);
      const parsed = schema.safeParse(answer);
      if (!parsed.success) throw new UnavailableError("The runtime gave an unexpected answer");
      return parsed.data;
    },
  };
}
