import type { ModelConfig } from "@aven/agents/model";
import type { MessageMention, QueuedSteer, RunEvent } from "@aven/protocol/events";
import type { RunMemory } from "@aven/protocol/memory";

import type { CockpitCaller } from "../cockpit/commands";
import type { MemoryCaller } from "../memory/commands";
import type { RunIdentity } from "../workload-identity/grants";
import type {
  RunAttachment,
  RunEnvVar,
  RunGithub,
  RunOutcome,
  RunSkill,
  RunMcpServer,
  SteerResult,
} from "@aven/protocol/runtime-wire";

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
