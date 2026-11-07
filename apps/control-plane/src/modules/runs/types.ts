import type { CockpitCaller } from "../cockpit/types";
import type { MemoryCaller } from "../memory/types";
import type { RunIdentity } from "../workload-identity/types";
import type { ModelConfig } from "@aven/agents/types";
import type {
  MessageMention,
  QueuedSteer,
  RunAttachment,
  RunEnvVar,
  RunEvent,
  RunGithub,
  RunMcpServer,
  RunMemory,
  RunOutcome,
  RunSkill,
  SteerResult,
} from "@aven/protocol/types";

export type RunThread = {
  id: string;
  organizationId: string;
  runtimeId: string;
  parentThreadId?: string | null;
};

export type RunExtras = Pick<
  StartRunInput,
  | "attachments"
  | "mentions"
  | "skills"
  | "mcp"
  | "github"
  | "env"
  | "identity"
  | "compact"
  | "memory"
  | "cockpit"
>;

export type RunMemoryInput = { caller: MemoryCaller; index: RunMemory };

export type StartRunInput = {
  thread: RunThread;
  prompt: string;
  compact?: boolean;
  attachments?: RunAttachment[];
  mentions?: MessageMention[];
  skills?: RunSkill[];
  mcp?: RunMcpServer[];
  github?: RunGithub;
  env?: RunEnvVar[];
  identity?: RunIdentity;
  memory?: RunMemoryInput;
  cockpit?: CockpitCaller;
  model?: ModelConfig;
};

export type ResumeRunInput = {
  thread: RunThread;
  continuation: unknown;
  response: unknown;
  skills?: RunSkill[];
  mcp?: RunMcpServer[];
  github?: RunGithub;
  env?: RunEnvVar[];
  identity?: RunIdentity;
  memory?: RunMemoryInput;
  cockpit?: CockpitCaller;
  model?: ModelConfig;
};

export type RunResult = { type: RunOutcome; continuation?: unknown };

export type RuntimeRun = {
  events: AsyncIterable<RunEvent>;
  result: Promise<RunResult>;
  cancel(reason: string): void;
  steer(message: QueuedSteer): Promise<SteerResult>;
};

export interface Runtime {
  start(input: StartRunInput): RuntimeRun;
  resume(input: ResumeRunInput): RuntimeRun;
  dispose(): void;
}

export type ContinuationStore = {
  save(threadId: string, continuation: unknown): Promise<void>;
  clear(threadId: string): Promise<void>;
};

export type FailureStore = {
  record(threadId: string, message: string | null): Promise<void>;
  read(threadId: string): Promise<string | null>;
};

export type RunEnding =
  | { outcome: "done" }
  | { outcome: "failed"; error: string }
  | { outcome: "question" }
  | { outcome: "cancelled" };

export type FinishedRun = { startedAt: number };
