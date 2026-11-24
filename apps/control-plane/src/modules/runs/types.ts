import type { CockpitCaller } from "../cockpit/types";
import type { MemoryCaller } from "../memory/types";
import type { RunIdentity } from "../workload-identity/types";
import type { ModelConfig } from "@aven/agents/types";
import type { RuntimeConnection } from "../runtimes/hub";
import type {
  AgentBackendKind,
  ContextSegment,
  MessageMention,
  PlanLimit,
  QueuedSteer,
  RunAttachment,
  RunEnvVar,
  RunEvent,
  RunGithub,
  RunLens,
  RunMcpServer,
  RunMemory,
  RunOutcome,
  RunSkill,
  RunWebSearch,
  SandboxPhase,
  SteerResult,
  ToolNarration,
  ToolPart,
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
  | "lens"
  | "compact"
  | "memory"
  | "cockpit"
  | "claudeToken"
  | "claudeModel"
  | "claudeEffort"
  | "codexToken"
  | "codexModel"
  | "codexEffort"
> & { senderId?: string };

export type RunMemoryInput = { caller: MemoryCaller; index: RunMemory };

export type RunSharedInput = {
  thread: RunThread;
  skills?: RunSkill[];
  mcp?: RunMcpServer[];
  github?: RunGithub;
  env?: RunEnvVar[];
  identity?: RunIdentity;
  webSearch?: RunWebSearch;
  lens?: RunLens;
  memory?: RunMemoryInput;
  cockpit?: CockpitCaller;
  model?: ModelConfig;
  claudeToken?: string;
  claudeModel?: string;
  claudeEffort?: string;
  codexToken?: string;
  codexModel?: string;
  codexEffort?: string;
};

export type StartRunInput = RunSharedInput & {
  prompt: string;
  compact?: boolean;
  attachments?: RunAttachment[];
  mentions?: MessageMention[];
  onSandboxPhase?: (phase: SandboxPhase) => void;
};

export type ResumeRunInput = RunSharedInput & {
  continuation: unknown;
  response: unknown;
};

export type RunResult = { type: RunOutcome; continuation?: unknown };

export type RuntimeRun = {
  events: AsyncIterable<RunEvent>;
  result: Promise<RunResult>;
  cancel(reason: string): void;
  steer(message: QueuedSteer, files?: RunAttachment[]): Promise<SteerResult>;
  sandbox?: boolean;
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

export type LimitStore = {
  record(threadId: string, limits: readonly PlanLimit[]): Promise<void>;
  read(threadId: string): Promise<PlanLimit[]>;
};

export type StoredContextSplit = { usedTokens: number; segments: ContextSegment[] };

export type ContextSplitStore = {
  record(threadId: string, split: StoredContextSplit): Promise<void>;
  read(threadId: string): Promise<StoredContextSplit | null>;
};

export type SenderStore = {
  record(threadId: string, messageIndex: number, senderId: string): Promise<void>;
  read(threadId: string): Promise<Map<number, string>>;
};

export type NarrationStore = {
  record(threadId: string, narration: ToolNarration): Promise<void>;
  read(threadId: string): Promise<Record<string, ToolNarration>>;
};

export type RunNarrator = {
  narrate(tool: ToolPart, signal?: AbortSignal): Promise<ToolNarration | null>;
};

export type RunEnding =
  | { outcome: "done" }
  | { outcome: "failed"; error: string }
  | { outcome: "question" }
  | { outcome: "cancelled" };

export type FinishedRun = { startedAt: number };
