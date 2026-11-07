import { asRecord } from "@aven/agents/values";
import type { MessageMention } from "@aven/protocol/events";
import {
  DIFF_SCOPES,
  type ArtifactsReadParams,
  type DesktopCallParams,
  type DiffGetParams,
  type DiffScope,
  type FilesCallParams,
  type FilesSearchParams,
  type ProcessesCallParams,
  type RunnerUpdateParams,
  type SandboxReleaseParams,
} from "@aven/protocol/runtime-wire";

const invalid = () => new Error("Invalid parameters");

const isDiffScope = (value: unknown): value is DiffScope =>
  (DIFF_SCOPES as readonly unknown[]).includes(value);

export function diffGetParams(params: unknown): DiffGetParams {
  const { threadId, scope } = asRecord(params);
  if (typeof threadId !== "string" || !isDiffScope(scope)) throw invalid();
  return { threadId, scope };
}

export function filesCallParams(params: unknown): FilesCallParams {
  const { threadId, path } = asRecord(params);
  if (typeof threadId !== "string" || typeof path !== "string") throw invalid();
  return { threadId, path };
}

export function filesSearchParams(params: unknown): FilesSearchParams {
  const { threadId, query } = asRecord(params);
  if (typeof threadId !== "string" || typeof query !== "string") throw invalid();
  return { threadId, query };
}

export function artifactsReadParams(params: unknown): ArtifactsReadParams {
  const { threadId, name } = asRecord(params);
  if (typeof threadId !== "string" || typeof name !== "string") throw invalid();
  return { threadId, name };
}

export function processesCallParams(params: unknown): ProcessesCallParams {
  const { threadId, processId } = asRecord(params);
  if (typeof threadId !== "string") throw invalid();
  if (processId !== undefined && typeof processId !== "string") throw invalid();
  return { threadId, processId };
}

export function runnerUpdateParams(params: unknown): RunnerUpdateParams {
  const { release } = asRecord(params);
  if (release === undefined || release === null) return {};
  if (typeof release !== "string" || !/^\d+\.\d+\.\d+$/.test(release)) throw invalid();
  return { release };
}

export function sandboxReleaseParams(params: unknown): SandboxReleaseParams {
  const { threadId } = asRecord(params);
  if (typeof threadId !== "string") throw invalid();
  return { threadId };
}

export function desktopCallParams(
  params: unknown,
): DesktopCallParams & { force: boolean; bot: boolean } {
  const { threadId, holder, leaseMs, force, bot } = asRecord(params);
  if (typeof threadId !== "string") throw invalid();
  return {
    threadId,
    holder: typeof holder === "string" ? holder : undefined,
    leaseMs: typeof leaseMs === "number" ? leaseMs : undefined,
    force: force === true,
    bot: bot === true,
  };
}

export type SteerParams = {
  runId: string;
  steerId: string;
  prompt: string;
  mentions?: MessageMention[];
};

export function steerParams(params: unknown): SteerParams {
  const { runId, steerId, prompt, mentions } = asRecord(params);
  if (typeof runId !== "string" || typeof steerId !== "string" || typeof prompt !== "string")
    throw invalid();
  if (mentions !== undefined && !Array.isArray(mentions)) throw invalid();
  return { runId, steerId, prompt, mentions: mentions as MessageMention[] | undefined };
}
