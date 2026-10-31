import { asRecord } from "@aven/agents/values";
import {
  DIFF_SCOPES,
  type ArtifactsReadParams,
  type DesktopCallParams,
  type DiffGetParams,
  type DiffScope,
  type FilesCallParams,
  type FilesSearchParams,
} from "@aven/protocol/runtime-wire";

// The params of the control plane's calls, checked: the control plane is trusted, but a call of the
// wrong shape is answered with an error rather than acted on.

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

/** Anything but a string `holder`, a number `leaseMs`, `force: true` or `bot: true` is left out. */
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
