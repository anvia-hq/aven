import type { AgentBackendCapabilities } from "@aven/protocol/runtime-wire";
import type {
  AgentBackendKind,
  BotMemoryParams,
  BotPeer,
  BotReplyInfo,
  CockpitAccess,
  ComputerState,
  ControlPlaneToRuntime,
  MachineOp,
  McpConnectResult,
  MessageMention,
  ProcessLogs,
  ProcessView,
  RepoAccess,
  RunEnvVar,
  RunEvent,
  RunGithub,
  RunIdentityCredential,
  RunMemory,
  RunModel,
  RunSkill,
  QuestionPrompt,
  RunThreadInfo,
  RunWebSearch,
  ToolArtifact,
  RuntimeCalls,
  RuntimeToControlPlane,
  SteerResult,
} from "@aven/protocol/types";
import type {
  AskQuestion,
  CockpitHost,
  CreateBot,
  ForkHost,
  GoalHost,
  McpServersHost,
  MemoryHost,
  ProvidersHost,
  RunSubagent,
  ScheduleHost,
  SendMessage,
  TakenChanges,
  ApiHost,
  ThreadsHost,
  UpdateSelf,
} from "@aven/agents/tools/types";
import type {
  Agent,
  AgentMemoryOptions,
  AgentOutcome,
  AgentPrompt,
  AnyTool,
  Message,
} from "@anvia/core";
import type {
  KeptAttachment,
  McpNote,
  SandboxPaths,
  SkillListing,
  SubagentType,
} from "@aven/agents/types";
import type {
  DefinedGoal,
  DurableAgentRegistration,
  DurableRun,
  DurableRuntime,
} from "@anvia/durable";
import type { z } from "zod";
import type { SandboxRuntime } from "@anvia/sandbox";
import type { ComputerHost } from "@aven/agents/tools/computer";
import type { GoalRequest } from "@aven/agents/tools/define-goal";
import type { AgentInteractionResponse } from "@anvia/core/agent/interactions";
import type { RunOutbox } from "./run-outbox";
import type { RunRecords } from "./run-records";
import type { IdleRelease } from "./idle-release";
import type { ProcessEndWatch } from "./process-end-watch";
import type { ArtifactStore } from "./artifacts";
import type { UploadStore } from "./uploads";
import type { SkillStore } from "./skills";

export type BotReplyMessage = Extract<ControlPlaneToRuntime, { type: "bot.reply" }>;

export type CreateBotReplyAgent = (input: {
  bot: BotReplyInfo;
  model: RunModel;
  send: SendMessage;
  memory: AgentMemoryOptions;
  computer: readonly AnyTool[];
  paths?: SandboxPaths;
  createBot?: CreateBot;
  askQuestion?: AskQuestion;
  goals: GoalHost;
  schedules: ScheduleHost;
  peers: BotPeer[];
  updateSelf: UpdateSelf;
  skills: readonly SkillListing[];
  mcp?: { tools: readonly AnyTool[]; note: McpNote };
  mcpServers: McpServersHost;
  providers: ProvidersHost;
  threads: ThreadsHost;
  api?: ApiHost;
  notes?: { memory: RunMemory; host: MemoryHost };
  cockpit?: { access: CockpitAccess; host: CockpitHost };
}) => Pick<Agent<unknown>, "generate">;

export type BotRepliesContext = {
  sandbox: ThreadWorkspaces;
  machines?: ThreadWorkspaces;
  machineCall?: (botId: string) => MachineCall;
  createAgent: CreateBotReplyAgent;
  send(message: RuntimeToControlPlane): boolean;
  call<M extends keyof RuntimeCalls>(
    method: M,
    params: RuntimeCalls[M]["params"],
  ): Promise<RuntimeCalls[M]["result"]>;
  boxes: Map<string, ThreadSandbox>;
  starting(botId: string): Promise<void>;
  finished(botId: string): void;
  pause?: (ms: number, signal?: AbortSignal) => Promise<void>;
};

export type SteerParams = {
  runId: string;
  steerId: string;
  prompt: string;
  mentions?: MessageMention[];
};

export type ControlPlaneCallsContext = {
  send(message: RuntimeToControlPlane): boolean;
  timeoutMs: number;
};

export type ViewerLink = {
  send(message: RuntimeToControlPlane): void;
  sendBinary(frame: Uint8Array): void;
  buffered(): number;
};

export type DurableEnd =
  | { type: "response"; messages: AgentOutcome<unknown>["messages"] }
  | { type: "interaction"; continuation: unknown; messages: AgentOutcome<unknown>["messages"] }
  | { type: "error"; error: string };

export type GoalEnd =
  | { type: "complete"; summary: string; evidence: string[] }
  | { type: "paused"; reason: string; summary: string; next: string }
  | { type: "error"; error: string };

export type GoalState = {
  taskId?: string;
  sessions: Record<string, { number: number; filed: boolean }>;
};

export type FollowedGoal = {
  done: Promise<GoalEnd>;
  cancel(): Promise<void>;
  steer(prompt: AgentPrompt, requestId: string): Promise<boolean>;
};

export type GoalContext = { verify: () => Promise<CommandResult[]> };

export type GoalSpec = {
  runId: string;
  request: GoalRequest;
  input: RunInput;
  verify: () => Promise<CommandResult[]>;
  onEvent: Emit;
  onSession: (session: number, messages: Message[]) => Promise<void>;
  state?: GoalState;
  saveState?: (state: GoalState) => void;
  cursorOf?: (durableId: string) => number;
};

export type GoalJournal = {
  runtime: DurableRuntime;
  goal: DefinedGoal;
  contexts: Map<string, GoalContext>;
  registerOrKeep(input: RunInput): void;
  follow(run: DurableRun, input: RunInput, onEvent: Emit, options?: FollowOptions): FollowedRun;
  release(agentId: string, end: DurableEnd): void;
  revive(agentIds: readonly string[]): Promise<void>;
  steer(durableId: string, prompt: AgentPrompt, requestId: string): Promise<boolean>;
};

export type Emit = (event: RunEvent, source?: Source) => void;

export type ClaudeQuestion = {
  name: "ask_user" | "request_secret";
  questions: QuestionPrompt[];
};

export type ClaudeMcpTool = {
  name: string;
  description: string;
  shape: Record<string, z.ZodType>;
  handler(args: unknown): Promise<{ content: { type: "text"; text: string }[]; isError?: boolean }>;
};

export type ClaudeToolHost = {
  memory?(command: unknown): Promise<unknown>;
  cockpit?(command: unknown): Promise<unknown>;
  fork?(input: {
    task: string;
    context: string;
    title?: string;
  }): Promise<{ id: string; title: string }>;
  catalog?: readonly AnyTool[];
  questions?: boolean;
  webSearch?: RunWebSearch;
  signal?: AbortSignal;
  emit?(event: RunEvent): void;
  onPark?(question: ClaudeQuestion): Promise<string>;
  runSubagent?: RunSubagent;
  shown?(artifacts: ToolArtifact[]): void;
};

export type ClaudeRunContext = {
  token?: string;
  workspace(): Promise<string>;
  tools: ClaudeToolHost;
  redact(text: string): string;
  env: readonly RunEnvVar[];
  instructions?: string;
  model?: string;
  effort?: string;
  compact?: boolean;
  questions?: boolean;
  children?: boolean;
};

export type ClaudeUsage = {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
};

export type ClaudeSdkMessage =
  | {
      type: "assistant";
      session_id?: string;
      error?: string;
      message?: { content?: unknown; usage?: ClaudeUsage };
    }
  | { type: "user"; session_id?: string; message?: { content?: unknown } }
  | { type: "system"; session_id?: string }
  | {
      type: "result";
      session_id?: string;
      subtype?: string;
      result?: string;
      errors?: string[];
      usage?: ClaudeUsage;
    }
  | {
      type: "stream_event";
      session_id?: string;
      event?: {
        type?: string;
        delta?: { type?: string; text?: string; thinking?: string };
      };
    };

export type ClaudeQueryInput = {
  prompt: AsyncIterable<string>;
  sessionId?: string;
  token: string;
  cwd: string;
  configDir: string;
  binaryDir: string;
  abortController: AbortController;
  tools: ClaudeToolHost;
  env: readonly RunEnvVar[];
  redact(text: string): string;
  instructions?: string;
  model?: string;
  effort?: string;
  maxTurns?: number;
  resumeInterrupted?: boolean;
};

export type ClaudeQuery = (
  input: ClaudeQueryInput,
) => AsyncIterable<ClaudeSdkMessage> & { close?(): void };

export type CodexInstructionExtras = {
  skills?: readonly SkillListing[];
  skillsUnavailable?: readonly string[];
  envNames?: readonly string[];
  mcp?: McpNote;
  memory?: RunMemory;
  forks?: boolean;
  paths?: SandboxPaths;
};

export type CodexRunContext = {
  login: string;
  model?: string;
  instructions: string;
  tools: readonly AnyTool[];
  redact?: <T>(value: T) => T;
  compact?: boolean;
  questions?: boolean;
  children?: boolean;
  rememberSession?: boolean;
  images?: readonly string[];
  extras?: CodexInstructionExtras;
};

export type RunInput = {
  agent?: Agent<unknown>;
  compaction?: DurableAgentRegistration["compaction"];
  contextWindow?: number;
  claude?: ClaudeRunContext;
  codex?: CodexRunContext;
};

export type ToolConcurrencyProbe = (registration: DurableAgentRegistration) => void;

export type FollowOptions = {
  agentId?: string;
  after?: number;
  keepAgent?: boolean;
};

export type FollowedRun = {
  durableId: string;
  done: Promise<DurableEnd>;
  cancel(): Promise<void>;
};

export type AskedRun = { runId: string; agentId: string };

export type AskedQuestion = { id: string; toolCallId: string };

export interface AgentBackend {
  readonly kind: AgentBackendKind;
  readonly capabilities: AgentBackendCapabilities;
  asked(threadId: string): Promise<AskedRun | undefined>;
  start(
    runId: string,
    threadId: string,
    prompt: AgentPrompt,
    input: RunInput,
    onEvent: Emit,
  ): Promise<FollowedRun>;
  rejoin(durableId: string, input: RunInput, after: number, onEvent: Emit): Promise<FollowedRun>;
  answer(
    asked: AskedRun,
    question: AskedQuestion,
    response: AgentInteractionResponse,
    restore: () => RunInput,
    onEvent: Emit,
  ): Promise<FollowedRun>;
  steer(durableId: string, prompt: AgentPrompt, requestId: string): Promise<boolean>;
  startGoal(goal: GoalSpec): Promise<FollowedGoal>;
  transcriptTurn(durableId: string, end: Exclude<DurableEnd, { type: "error" }>): number;
  unfinishedMessages(durableId: string): Promise<Message[]>;
  cancelRun(durableId: string): Promise<void>;
  close(): Promise<void>;
}

export type ThreadRef = {
  id: string;
  machine?: string;
  organizationId?: string;
  forkOf?: string;
  projectId?: string;
  ownerId?: string;
  bot?: boolean;
};

export type Fetched = { branch: string; commit: string; previous: string | null };

export type Git = (
  args: string[],
  options: { cwd: string; env?: Record<string, string>; timeoutMs?: number },
) => Promise<CommandOutput>;

export type CommandResult = {
  command: string;
  exitCode: number | null;
  output: string;
};

export type IdleReleaseContext = {
  sandbox: Pick<ThreadWorkspaces, "release">;
  boxes: Map<string, ThreadSandbox>;
  idleMs: number;
  stopped(): boolean;
  hasRun(threadId: string): boolean;
  isWatched(threadId: string): boolean;
};

export type ResolveHost = (host: string) => Promise<string[]>;

export type ConnectedMcpServer = { id: string; name: string; tools: AnyTool[] };

export type ConnectedMcp = {
  tools: AnyTool[];
  servers: ConnectedMcpServer[];
  results: McpConnectResult[];
  note: McpNote;
  close(): Promise<void>;
};

export type ProcessEndWatchContext = {
  box(threadId: string): ThreadSandbox | undefined;
  send(message: RuntimeToControlPlane): boolean;
  hasRun(threadId: string): boolean;
  stopped(): boolean;
  pollMs?: number;
};

export type BotMemoryCall = (params: BotMemoryParams) => Promise<unknown>;

export type CommandOutput = { code: number; stdout: string; stderr: string; timedOut?: true };

export type CreateRuntimeAgent = (input: {
  thread: RunThreadInfo;
  id: string;
  attended: boolean;
  tools: readonly AnyTool[];
  skills?: readonly SkillListing[];
  skillsUnavailable?: readonly string[];
  envNames?: readonly string[];
  paths?: SandboxPaths;
  mcp?: McpNote;
  memory?: RunMemory;
  webSearch?: RunWebSearch;
  forks?: boolean;
  model?: RunModel;
  role?: SubagentType;
  compact?: boolean;
}) => { agent: Agent<unknown>; compaction?: DurableAgentRegistration["compaction"] };

export type RunMessage = Extract<ControlPlaneToRuntime, { type: "run.start" | "run.resume" }>;

export type AgentBackendSet = {
  readonly offered: readonly AgentBackendKind[];
  get(kind: string | undefined): Promise<AgentBackend>;
  close(): Promise<void>;
};

export type DriverContext = {
  backend(kind: string | undefined): Promise<AgentBackend>;
  machineCall?: (threadId: string) => MachineCall;
  records: RunRecords;
  outbox: RunOutbox;
  sandbox: ThreadWorkspaces;
  createAgent: CreateRuntimeAgent;
  call<M extends keyof RuntimeCalls>(
    method: M,
    params: RuntimeCalls[M]["params"],
  ): Promise<RuntimeCalls[M]["result"]>;
  report(
    runId: string,
    make: (seq: number) => Extract<RuntimeToControlPlane, { type: "run.event" | "run.end" }>,
    source?: Source,
  ): void;
  boxes: Map<string, ThreadSandbox>;
  starting(threadId: string): Promise<void>;
  finished(threadId: string, ended?: DurableEnd["type"]): void;
  controlPlane: string;
  stopped(): boolean;
};

export type Source = { id: string; sequence: number };

export type RunRecord = {
  runId: string;
  thread: RunThreadInfo;
  model?: RunModel;
  kind: "start" | "answer";
  prompt?: string;
  compact?: boolean;
  attachments?: KeptAttachment[];
  mentions?: MessageMention[];
  skills?: RunSkill[];
  skillListing?: SkillListing[];
  memory?: RunMemory;
  webSearch?: RunWebSearch;
  cockpit?: CockpitAccess;
  agentId: string;
  durableId?: string;
  turn: number;
  phase: "chat" | "goal" | "report";
  goal?: GoalRequest;
  goalState?: GoalState;
  reportId?: string;
  done?: boolean;
  backend?: string;
  claudeModel?: string;
  claudeEffort?: string;
};

export type RunToolsInput = {
  sandbox: ThreadWorkspaces;
  thread: RunThreadInfo;
  tools: readonly AnyTool[];
  current: () => readonly AnyTool[] | undefined;
  mcp?: { tools: readonly AnyTool[]; current: () => readonly AnyTool[] | undefined };
  attended: boolean;
  repoAccess: () => Promise<RepoAccess>;
  defineGoal: (goal: GoalRequest) => void;
  createSubagent: CreateSubagent;
  emit: (event: RunEvent) => void;
  memory?: MemoryHost;
  forks?: ForkHost;
  cockpit?: CockpitHost;
  computer?: ComputerHost;
};

export type MachineProcessWatch = {
  begin(threadId: string): Promise<void>;
  end(threadId: string, phase: "settle" | "suspend"): void;
  has(threadId: string): boolean;
};

export type RunnerCallsContext = {
  sandbox: ThreadWorkspaces;
  boxes: Map<string, ThreadSandbox>;
  idle: Pick<IdleRelease, "schedule" | "starting" | "releaseNow">;
  update?: {
    start(release: string | undefined): void;
    busy(): string | undefined;
  };
  processEnds: Pick<ProcessEndWatch, "ignore">;
  machineProcesses: MachineProcessWatch;
  steer(params: SteerParams): Promise<SteerResult>;
  dirs?: string[];
};

export type ThreadArtifacts = Pick<ArtifactStore, "save" | "keep" | "read">;

export type UploadPlacement = {
  settle(threadId: string): Promise<void>;
  placed(threadId: string, name: string): string | undefined;
  claim(threadId: string, name: string): void;
  placedNote(threadId: string): string | undefined;
};

export type MachineCall = (op: MachineOp, args?: unknown) => Promise<unknown>;

export type MachineCallsContext = Pick<
  RunnerCallsContext,
  "sandbox" | "boxes" | "idle" | "machineProcesses"
>;

export type RuntimeOptions = {
  url: string;
  token: string;
  build?: string;
  host?: boolean;
  dirs?: string[];
  update?: (release: string | undefined) => void;
  createAgent?: CreateRuntimeAgent;
  createBotAgent?: CreateBotReplyAgent;
  typingPause?: BotRepliesContext["pause"];
  sandbox: ThreadWorkspaces;
  journalPath: string;
  statePath?: string;
  onRefused?: (reason: string) => void;
  callTimeoutMs?: number;
  idleReleaseMs?: number;
  processPollMs?: number;
  statsIntervalMs?: number;
};

export type AcquireOptions = {
  lazy?: boolean;
  folder?: () => Promise<string | null>;
};

export type ThreadSandbox = {
  tools: readonly AnyTool[];
  runtime?: SandboxRuntime;
  hasRunningProcesses(): Promise<boolean>;
  processes: ThreadProcesses;
  start?(): Promise<void>;
  state?(): ComputerState;
};

export interface ThreadWorkspaces {
  acquire(
    thread: ThreadRef,
    repo?: () => Promise<RepoAccess>,
    options?: AcquireOptions,
  ): Promise<ThreadSandbox>;
  shell?(
    threadId: string,
    sessionId: string,
  ): { argv: string[]; env: Record<string, string>; hangup: string[] } | undefined;
  workspace(threadId: string): Promise<string | undefined>;
  paths?(threadId: string): SandboxPaths | undefined;
  markTurn?(threadId: string): Promise<boolean>;
  fetchBranch?(threadId: string, access: RepoAccess, branch?: string): Promise<Fetched>;
  takeFork?(threadId: string, forkId: string): Promise<TakenChanges>;
  release(threadId: string): Promise<void>;
  putAway?(threadId: string): Promise<void>;
  running?(): number;
  signInGithub?(threadId: string, github: RunGithub | undefined): Promise<void>;
  signInIdentity?(
    threadId: string,
    identity: RunIdentityCredential | undefined,
    controlPlane: string,
  ): Promise<void>;
  setProjectEnv?(threadId: string, env: readonly RunEnvVar[] | undefined): void;
  readonly artifacts?: ThreadArtifacts;
  readonly uploads?: Pick<UploadStore, "save"> &
    Partial<Pick<UploadStore, "put">> &
    Partial<UploadPlacement>;
  readonly skills?: Pick<SkillStore, "install">;
  dispose(): Promise<void>;
}

export type FetchSkill = (digest: string) => Promise<Uint8Array>;

export type CreateSubagent = (input: {
  type: SubagentType;
  id: string;
  tools: AnyTool[];
}) => Agent<unknown>;

export type FakeControlPlaneOptions = {
  storesTranscripts?: boolean;
  answer?: (message: Extract<RuntimeToControlPlane, { type: "call" }>) => unknown;
};

export type ThreadProcesses = {
  start(command: string): Promise<ProcessView>;
  list(): Promise<ProcessView[]>;
  stop(processId: string): Promise<ProcessView[]>;
  logs(processId: string): Promise<ProcessLogs>;
};

export type Timing = {
  mark(step: string): void;
};

export type IdentityRelay = { port: number; stop: () => void };

export type Spawned = ReturnType<typeof Bun.spawn>;

export type Terminate = (proc: Spawned) => Promise<void>;

export type Launch = (input: {
  argv: string[];
  cwd: string;
  inside: string;
  env?: Readonly<Record<string, string>>;
}) => Spawned;

export type HostSandboxConfig = {
  home?: string;
  dirs?: string[];
  git?: Git;
};

export type ClaudeBinaryEntry = { package: string; version: string; integrity: string };

export type ClaudeBinaryOptions = {
  dir: string;
  platform?: string;
  arch?: string;
  musl?: boolean;
  manifest?: Record<string, ClaudeBinaryEntry>;
  registry?: string;
  fetchTarball?: typeof fetch;
  bundled?: (entry: ClaudeBinaryEntry) => string | undefined;
};
