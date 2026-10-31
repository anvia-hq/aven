import type {
  ArtifactsReadParams,
  DesktopCallParams,
  DiffGetParams,
  FilesCallParams,
  FilesSearchParams,
  RunnerCallMethod,
} from "@aven/protocol/runtime-wire";
import type { z } from "zod";

import { describeError, UnavailableError } from "../../errors";
import { threadsService } from "../threads/service";
import { RuntimeOfflineError, type RuntimeHub } from "./hub";

/** A runner's answer about a thread that may have no workspace or sandbox yet. */
export type Available<T> = { available: false } | ({ available: true } & T);

/**
 * What a call the runner refuses tells the client. The runner's own reason stays in the log, after
 * `logged`; the client gets `message`, or the error `instead` makes of the reason, when it makes one.
 */
export type Refusal = {
  logged: string;
  message: string;
  instead?: (reason: string) => Error | undefined;
};

function refuse(refusal: Refusal, error: unknown): never {
  const reason = describeError(error);
  console.warn(refusal.logged, reason);
  throw refusal.instead?.(reason) ?? new UnavailableError(refusal.message);
}

type CallParams =
  | ArtifactsReadParams
  | DesktopCallParams
  | DiffGetParams
  | FilesCallParams
  | FilesSearchParams;

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
    // A `refusal` turns the runner's own error into the client's; without one, that error goes through.
    async ask<T>(
      organizationId: string,
      method: RunnerCallMethod,
      params: CallParams,
      schema: z.ZodType<T>,
      refusal?: Refusal,
      // For a call that takes long, such as starting a container; the default is a few seconds.
      timeoutMs?: number,
    ) {
      const runner = await connection(organizationId, params.threadId);
      const call = runner.call(method, params, timeoutMs);
      const answer = await (refusal ? call.catch((error) => refuse(refusal, error)) : call);
      const parsed = schema.safeParse(answer);
      if (!parsed.success) throw new UnavailableError("The runtime gave an unexpected answer");
      return parsed.data;
    },
  };
}
