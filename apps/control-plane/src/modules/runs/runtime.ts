import type { ModelConfig } from "@aven/agents/model";
import type { RunEvent } from "@aven/protocol/events";

/** What a run needs to know about its thread. The workspace is the runner's own business. */
export type RunThread = {
  id: string;
  organizationId: string;
  /** The runner the thread's sandbox runs on. */
  runtimeId: string;
};

export type StartRunInput = { thread: RunThread; prompt: string; model?: ModelConfig };

// One agent run as the control plane sees it. Everything a run needs from the machine it runs on
// (the agent loop, its tools, the sandbox) stays behind this handle (decisions 0008 and 0010).
export type RuntimeRun = {
  /** The run's progress as protocol events; ends when the run does. */
  events: AsyncIterable<RunEvent>;
  /** How the run ended; `type` is "response" for a normal finish. */
  result: Promise<{ type: string }>;
  cancel(reason: string): void;
};

export interface Runtime {
  /**
   * Starts a run. Throws synchronously on a setup error (the runner is offline, or the model
   * cannot be used) before anything is persisted. `model` is the sender's provider; undefined
   * means the environment's.
   */
  start(input: StartRunInput): RuntimeRun;
  dispose(): void;
}
