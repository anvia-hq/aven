// The wire between the control plane and a runtime (decision 0008): JSON text frames over one
// WebSocket that the runtime opens. Either side can send a one-way message, or a `call` that the
// other answers with a `reply` carrying the same id. No runtime imports, so any client can bundle it.

import type { RunEvent } from "./events";

export type RunThreadInfo = {
  id: string;
  organizationId: string;
};

export type Provider = "openai" | "anthropic" | "openai-compatible";

/** How a run ended: `response` is a normal finish, `error` means the run threw. */
export type RunOutcome = "response" | "blocked" | "interaction" | "error";

/** How a runtime reaches a model. The key stays on the control plane; the token only works for one run. */
export type RunModel = {
  provider: Provider;
  modelId?: string;
  reasoningEffort?: string;
  effortLevels?: string[];
  /** Path on the control plane the model client uses as its API root; the runtime adds its own origin. */
  gatewayPath: string;
  gatewayToken: string;
};

export type Reply = {
  type: "reply";
  id: string;
  ok: boolean;
  result?: unknown;
  error?: string;
  /** A stable reason for known failures, so the caller can rebuild the right error. */
  code?: string;
};

/** Who may drive a thread's desktop; while a person holds it, the agent's inputs fail. */
export type DesktopControl = {
  held: boolean;
  holder?: string;
  expiresAt?: string;
};

/** Where a thread's desktop is, as the runner sees it. */
export type DesktopInfo = {
  state: "running" | "stopped" | "starting" | "restarting" | "failed";
  width: number;
  height: number;
  control: DesktopControl;
};

/** What the control plane asks of a runner about a thread's desktop (decision 0015). */
export type DesktopCallMethod = "desktop.status" | "desktop.takeover" | "desktop.release";

export type ControlPlaneToRuntime =
  | {
      type: "run.start";
      runId: string;
      thread: RunThreadInfo;
      prompt: string;
      model?: RunModel;
    }
  | { type: "run.cancel"; runId: string; reason: string }
  /** Start streaming the thread's desktop (VNC) as binary frames for `viewerId`. */
  | { type: "desktop.open"; viewerId: string; threadId: string }
  | { type: "desktop.close"; viewerId: string }
  | { type: "call"; id: string; method: DesktopCallMethod; params: unknown }
  | Reply;

export type RuntimeToControlPlane =
  | { type: "hello"; version: number }
  | { type: "run.event"; runId: string; event: RunEvent }
  /** The run is over. `error` carries the message when `outcome` is "error". */
  | { type: "run.end"; runId: string; outcome: RunOutcome; error?: string }
  | { type: "call"; id: string; method: CallMethod; params: unknown }
  /** The viewer is streaming; its bytes follow as binary frames. */
  | { type: "desktop.opened"; viewerId: string }
  /** The viewer ended, or could not start: `reason` says why in words. */
  | { type: "desktop.closed"; viewerId: string; reason: string }
  | Reply;

/** The runtime reads and writes the conversation, which the control plane owns. */
export type MemoryCallMethod = "memory.load" | "memory.append" | "memory.clear";

/** The runtime asks how to clone the thread's repository (decision 0013); params are `{ runId }`. */
export type RepoCallMethod = "repo.access";

export type CallMethod = MemoryCallMethod | RepoCallMethod;

/** What a runtime needs to clone a thread's repository. The token is short-lived and read-only. */
export type RepoAccess = {
  cloneUrl: string;
  defaultBranch: string;
  token: string;
};

export type MemoryAppendParams = {
  runId: string;
  turn: number;
  /** Messages in Anvia's format, as stored in conversation memory; opaque on the wire. */
  messages: unknown[];
};

// A viewer's VNC bytes travel as binary frames, in both directions: the viewer id as 16 bytes
// followed by the payload. Everything else on the wire is JSON text.
const VIEWER_ID_BYTES = 16;

export function encodeViewerFrame(viewerId: string, payload: Uint8Array): Uint8Array {
  const frame = new Uint8Array(VIEWER_ID_BYTES + payload.length);
  frame.set(Uint8Array.fromHex(viewerId.replaceAll("-", "")));
  frame.set(payload, VIEWER_ID_BYTES);
  return frame;
}

/** The viewer and bytes in a binary frame, or null when it is too short to carry a viewer id. */
export function decodeViewerFrame(frame: Uint8Array) {
  if (frame.length < VIEWER_ID_BYTES) return null;
  const hex = frame.subarray(0, VIEWER_ID_BYTES).toHex();
  const viewerId = [8, 12, 16, 20].reduceRight(
    (id, at) => `${id.slice(0, at)}-${id.slice(at)}`,
    hex,
  );
  return { viewerId, payload: frame.subarray(VIEWER_ID_BYTES) };
}

// Version 5: a runtime can stream a thread's desktop to a viewer and answer the control plane's
// calls about it (decision 0015). Version 4: a runtime can ask for access to the thread's repository, `repo.access` (decision
// 0013). Version 3: a run is only started and cancelled; commands and processes are the sandbox's,
// so no job notices, job stops or steering (decision 0012).
export const WIRE_VERSION = 5;
