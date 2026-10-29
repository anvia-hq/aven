// The wire between the control plane and a runtime (decision 0008): JSON text frames over one
// WebSocket that the runtime opens. Either side can send a one-way message, or a `call` that the
// other answers with a `reply` carrying the same id. No runtime imports, so any client can bundle it.

import type { RunEvent } from "./events";

export type RunThreadInfo = {
  id: string;
  organizationId: string;
};

/** How a runtime reaches a model. The key stays on the control plane; the token only works for one run. */
export type RunModel = {
  provider: "openai" | "anthropic" | "openai-compatible";
  modelId?: string;
  reasoningEffort?: string;
  effortLevels?: string[];
  /** Path on the control plane the model client uses as its API root; the runtime adds its own origin. */
  gatewayPath: string;
  gatewayToken: string;
};

/** A message in Anvia's format, as stored in conversation memory. Opaque on the wire. */
export type StoredMessage = unknown;

export type ControlPlaneToRuntime =
  | {
      type: "run.start";
      runId: string;
      thread: RunThreadInfo;
      prompt: string;
      model?: RunModel;
    }
  | { type: "run.cancel"; runId: string; reason: string }
  | { type: "run.steer"; runId: string; prompt: string }
  /** Kills the background commands a thread started. */
  | { type: "jobs.stop"; threadId: string }
  | Reply;

export type RuntimeToControlPlane =
  | { type: "hello"; version: number }
  | { type: "run.event"; runId: string; event: RunEvent }
  /** The run is over. `outcome` is "response" for a normal finish; `error` is set if it threw. */
  | { type: "run.end"; runId: string; outcome: string; error?: string }
  | { type: "job.notice"; threadId: string; notice: string }
  | { type: "call"; id: string; method: MemoryCallMethod; params: unknown }
  | Reply;

export type Reply = {
  type: "reply";
  id: string;
  ok: boolean;
  result?: unknown;
  error?: string;
  /** A stable reason for known failures, so the caller can rebuild the right error. */
  code?: string;
};

/** The runtime reads and writes the conversation, which the control plane owns. */
export type MemoryCallMethod = "memory.load" | "memory.append" | "memory.clear";

export type MemoryAppendParams = {
  runId: string;
  turn: number;
  messages: StoredMessage[];
};

// Version 2: no filesystem calls and no project path; a thread's workspace is the runner's own.
export const WIRE_VERSION = 2;
