import type { ModelConfig } from "@aven/agents/model";
import type { RunEvent } from "@aven/protocol/events";
import type { RunAttachment, RunOutcome, RunSkill } from "@aven/protocol/runtime-wire";

/** What a run needs to know about its thread. The workspace is the runner's own business. */
export type RunThread = {
  id: string;
  organizationId: string;
  /** The runner the thread's sandbox runs on. */
  runtimeId: string;
};

export type StartRunInput = {
  thread: RunThread;
  prompt: string;
  /** The files sent with the prompt, for the runner to copy into the sandbox (decision 0034). */
  attachments?: RunAttachment[];
  /** The sender's skills and the built-in ones (decision 0035). */
  skills?: RunSkill[];
  model?: ModelConfig;
};

/** A run that suspended on the agent's question, resumed with the user's answers. Both are opaque Anvia values. */
export type ResumeRunInput = {
  thread: RunThread;
  continuation: unknown;
  response: unknown;
  skills?: RunSkill[];
  model?: ModelConfig;
};

/** How a run ended: `response` for a normal finish, `interaction` when it waits for the user's answer (with the `continuation` to resume it). */
export type RunResult = { type: RunOutcome; continuation?: unknown };

// One agent run as the control plane sees it. Everything a run needs from the machine it runs on
// (the agent loop, its tools, the sandbox) stays behind this handle (decisions 0008 and 0010).
export type RuntimeRun = {
  /** The run's progress as protocol events; ends when the run does. */
  events: AsyncIterable<RunEvent>;
  /** How the run ended. */
  result: Promise<RunResult>;
  cancel(reason: string): void;
};

export interface Runtime {
  /**
   * Starts a run. Throws synchronously on a setup error (the runner is offline, or the model
   * cannot be used) before anything is persisted. `model` is the sender's provider; undefined
   * means the environment's.
   */
  start(input: StartRunInput): RuntimeRun;
  /** Continues a run that ended as "interaction". Throws like `start`. */
  resume(input: ResumeRunInput): RuntimeRun;
  dispose(): void;
}
