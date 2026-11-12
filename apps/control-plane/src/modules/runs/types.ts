import type { CockpitCaller } from "../cockpit/types";
import type { MemoryCaller } from "../memory/types";
import type { RunIdentity } from "../workload-identity/types";
import type { ModelConfig } from "@aven/agents/types";
import type { RuntimeConnection } from "../runtimes/hub";
import type {
  AgentBackendKind,
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
  RunWebSearch,
  SteerResult,
} from "@aven/protocol/types";

export type Placement = {
  connection: RuntimeConnection;
  hostId: string;
  machine?: string;
};

export type RunThread = {
  id: string;
  organizationId: string;
  runtimeId: string;
  agentBackend?: AgentBackendKind;
  parentThreadId?: string | null;
  projectId?: string;
  createdBy?: string;
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
  | "webSearch"
  | "compact"
  | "memory"
  | "cockpit"
  | "codexLogin"
  | "codexModel"
  | "claudeToken"
  | "claudeModel"
  | "claudeEffort"
> & { senderId?: string };

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
  webSearch?: RunWebSearch;
  memory?: RunMemoryInput;
  cockpit?: CockpitCaller;
  model?: ModelConfig;
  codexLogin?: string;
  codexModel?: string;
  claudeToken?: string;
  claudeModel?: string;
  claudeEffort?: string;
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
  webSearch?: RunWebSearch;
  memory?: RunMemoryInput;
  cockpit?: CockpitCaller;
  model?: ModelConfig;
  codexLogin?: string;
  codexModel?: string;
  claudeToken?: string;
  claudeModel?: string;
  claudeEffort?: string;
};

export type RunResult = { type: RunOutcome; continuation?: unknown };

export type RuntimeRun = {
  events: AsyncIterable<RunEvent>;
  result: Promise<RunResult>;
  cancel(reason: string): void;
  steer(message: QueuedSteer): Promise<SteerResult>;
};

export interface Runtime {
  start(input: StartRunInput): Promise<RuntimeRun>;
  resume(input: ResumeRunInput): Promise<RuntimeRun>;
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

export type WorkedTimeStore = {
  record(threadId: string, messageIndex: number, workedMs: number): Promise<void>;
  read(threadId: string): Promise<Map<number, number>>;
};

export type SenderStore = {
  record(threadId: string, messageIndex: number, senderId: string): Promise<void>;
  read(threadId: string): Promise<Map<number, string>>;
};

export type RunEnding =
  | { outcome: "done" }
  | { outcome: "failed"; error: string }
  | { outcome: "question" }
  | { outcome: "cancelled" };

export type FinishedRun = { startedAt: number };
