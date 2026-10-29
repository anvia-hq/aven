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
  /** The run is over. `error` carries the message when `outcome` is "error". */
  | { type: "run.end"; runId: string; outcome: RunOutcome; error?: string }
  | { type: "job.notice"; threadId: string; notice: string }
  | { type: "call"; id: string; method: MemoryCallMethod; params: unknown }
  | Reply;

/** The runtime reads and writes the conversation, which the control plane owns. */
export type MemoryCallMethod = "memory.load" | "memory.append" | "memory.clear";

export type MemoryAppendParams = {
  runId: string;
  turn: number;
  /** Messages in Anvia's format, as stored in conversation memory; opaque on the wire. */
  messages: unknown[];
};

// Version 2: no filesystem calls and no project path; a thread's workspace is the runner's own.
export const WIRE_VERSION = 2;
