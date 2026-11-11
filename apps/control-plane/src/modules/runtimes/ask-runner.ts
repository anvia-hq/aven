import type { z } from "zod";

import { describeError, UnavailableError } from "../../errors";
import { threadsService } from "../threads/service";
import type { RuntimeHub } from "./hub";
import { manualProvider } from "./providers";
import type { FindRunner, Refusal } from "./types";
import type {
  ActionRunParams,
  ArtifactsReadParams,
  ComputerCallParams,
  DiffGetParams,
  FilesCallParams,
  FilesSearchParams,
  ProcessesCallParams,
  RunnerCallMethod,
} from "@aven/protocol/types";

function refuse(refusal: Refusal, error: unknown): never {
  const reason = describeError(error);
  console.warn(refusal.logged, reason);
  throw refusal.instead?.(reason) ?? new UnavailableError(refusal.message);
}

type CallParams =
  | ActionRunParams
  | ArtifactsReadParams
  | ComputerCallParams
  | DiffGetParams
  | FilesCallParams
  | FilesSearchParams
  | ProcessesCallParams;

export function runnerVia(connection: FindRunner, kind?: { bot: true }) {
  return {
    connection,

    async ask<T>(
      scope: string,
      method: RunnerCallMethod,
      params: CallParams,
      schema: z.ZodType<T>,
      refusal?: Refusal,
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

export const runnerFor = (hub: RuntimeHub) =>
  runnerVia(async (organizationId, threadId) => {
    const thread = await threadsService.require(organizationId, threadId);
    return manualProvider(hub).reach(thread.runtimeId);
  });
