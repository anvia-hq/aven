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
import { RuntimeOfflineError, type RuntimeConnection, type RuntimeHub } from "./hub";

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

/**
 * How the runner that holds a computer is found: `scope` is whose it is, an organization for a
 * thread and a person for a bot, and `id` is the thread's or the bot's. Throws when it is not
 * theirs, or when the runner is offline.
 */
export type FindRunner = (scope: string, id: string) => Promise<RuntimeConnection>;

// Asking the runner that holds a computer about it (its files, changes, desktop). Every call
// starts from a computer of the caller's: a thread of their organization or a bot of their own. A
// `kind` is added to what every call carries, for a runner to tell a bot's computer from a thread's.
export function runnerVia(connection: FindRunner, kind?: { bot: true }) {
  return {
    connection,

    // What the runner answers is parsed; a runner that sends something else is as good as offline.
    // A `refusal` turns the runner's own error into the client's; without one, that error goes through.
    async ask<T>(
      scope: string,
      method: RunnerCallMethod,
      params: CallParams,
      schema: z.ZodType<T>,
      refusal?: Refusal,
      // For a call that takes long, such as starting a container; the default is a few seconds.
      timeoutMs?: number,
    ) {
      const runner = await connection(scope, params.threadId);
      const call = runner.call(method, { ...params, ...kind }, timeoutMs);
      const answer = await (refusal ? call.catch((error) => refuse(refusal, error)) : call);
      const parsed = schema.safeParse(answer);
      if (!parsed.success) throw new UnavailableError("The runtime gave an unexpected answer");
      return parsed.data;
    },
  };
}

/** Asking a computer's runner, whichever kind of computer it is. */
export type Runner = ReturnType<typeof runnerVia>;

// A thread's runner is the one its project is on, found through the caller's organization.
export const runnerFor = (hub: RuntimeHub) =>
  runnerVia(async (organizationId, threadId) => {
    const thread = await threadsService.require(organizationId, threadId);
    const found = hub.get(thread.runtimeId);
    if (!found) throw new RuntimeOfflineError();
    return found;
  });
