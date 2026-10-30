import { asRecord } from "@aven/agents/values";
import type {
  ArtifactsReadParams,
  DesktopCallParams,
  DiffGetParams,
  FilesCallParams,
} from "@aven/protocol/runtime-wire";

// The params of the control plane's calls, checked: the control plane is trusted, but a call of the
// wrong shape is answered with an error rather than acted on.

const invalid = () => new Error("Invalid parameters");

export function diffGetParams(params: unknown): DiffGetParams {
  const { threadId, scope } = asRecord(params);
  if (typeof threadId !== "string" || (scope !== "turn" && scope !== "all")) throw invalid();
  return { threadId, scope };
}

export function filesCallParams(params: unknown): FilesCallParams {
  const { threadId, path } = asRecord(params);
  if (typeof threadId !== "string" || typeof path !== "string") throw invalid();
  return { threadId, path };
}

export function artifactsReadParams(params: unknown): ArtifactsReadParams {
  const { threadId, name } = asRecord(params);
  if (typeof threadId !== "string" || typeof name !== "string") throw invalid();
  return { threadId, name };
}

/** Anything but a string `holder`, a number `leaseMs` or `force: true` is left out. */
export function desktopCallParams(params: unknown): DesktopCallParams & { force: boolean } {
  const { threadId, holder, leaseMs, force } = asRecord(params);
  if (typeof threadId !== "string") throw invalid();
  return {
    threadId,
    holder: typeof holder === "string" ? holder : undefined,
    leaseMs: typeof leaseMs === "number" ? leaseMs : undefined,
    force: force === true,
  };
}
