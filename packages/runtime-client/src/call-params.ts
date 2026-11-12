import { asRecord } from "@aven/agents/values";
import { DIFF_SCOPES, MACHINE_OPS } from "@aven/protocol/runtime-wire";
import type {
  ArtifactsReadParams,
  ComputerCallParams,
  DiffGetParams,
  DiffScope,
  FilesCallParams,
  FoldersCommitsParams,
  FoldersCreateParams,
  FoldersFilesParams,
  FoldersListParams,
  FoldersReadmeParams,
  FilesSearchParams,
  MachineCallParams,
  MessageMention,
  ProcessWatchParams,
  ActionRunParams,
  ProcessesCallParams,
  RunnerUpdateParams,
  SandboxReleaseParams,
} from "@aven/protocol/types";
import type { SteerParams } from "./types";

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

export function actionRunParams(params: unknown): ActionRunParams {
  const { threadId, command } = asRecord(params);
  if (typeof threadId !== "string") throw invalid();
  if (typeof command !== "string" || command.trim() === "") throw invalid();
  return { threadId, command };
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

export function computerCallParams(params: unknown): ComputerCallParams & { bot: boolean } {
  const { threadId, bot } = asRecord(params);
  if (typeof threadId !== "string") throw invalid();
  return { threadId, bot: bot === true };
}

export function steerParams(params: unknown): SteerParams {
  const { runId, steerId, prompt, mentions } = asRecord(params);
  if (typeof runId !== "string" || typeof steerId !== "string" || typeof prompt !== "string")
    throw invalid();
  if (mentions !== undefined && !Array.isArray(mentions)) throw invalid();
  return { runId, steerId, prompt, mentions: mentions as MessageMention[] | undefined };
}

export function foldersListParams(params: unknown): FoldersListParams {
  const { path } = asRecord(params);
  if (path === undefined || path === null) return {};
  if (typeof path !== "string" || path.length > 4096) throw invalid();
  return { path };
}

export function foldersCreateParams(params: unknown): FoldersCreateParams {
  const { path, name } = asRecord(params);
  if (typeof path !== "string" || typeof name !== "string") throw invalid();
  return { path, name };
}

export function foldersFilesParams(params: unknown): FoldersFilesParams {
  const { folder, path } = asRecord(params);
  if (typeof folder !== "string" || folder.length > 4096) throw invalid();
  if (path === undefined || path === null) return { folder };
  if (typeof path !== "string" || path.length > 4096) throw invalid();
  return { folder, path };
}

export function foldersReadmeParams(params: unknown): FoldersReadmeParams {
  const { folder } = asRecord(params);
  if (typeof folder !== "string" || folder.length > 4096) throw invalid();
  return { folder };
}

export function foldersCommitsParams(params: unknown): FoldersCommitsParams {
  const { folder, page } = asRecord(params);
  if (typeof folder !== "string" || folder.length > 4096) throw invalid();
  if (page === undefined || page === null) return { folder };
  if (typeof page !== "number" || !Number.isInteger(page) || page < 1 || page > 10_000) {
    throw invalid();
  }
  return { folder, page };
}

const WATCH_PHASES = ["arm", "settle", "suspend"] as const;

export function processWatchParams(params: unknown): ProcessWatchParams {
  const { threadId, phase } = asRecord(params);
  if (typeof threadId !== "string" || !(WATCH_PHASES as readonly unknown[]).includes(phase)) {
    throw invalid();
  }
  return { threadId, phase: phase as ProcessWatchParams["phase"] };
}

export function machineCallParams(params: unknown): MachineCallParams {
  const { threadId, op, args } = asRecord(params);
  if (typeof threadId !== "string" || !(MACHINE_OPS as readonly unknown[]).includes(op)) {
    throw invalid();
  }
  return { threadId, op: op as MachineCallParams["op"], args };
}
