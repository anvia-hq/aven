import type {
  BotMemoryParams,
  BotPeer,
  BotReplyInfo,
  CockpitAccess,
  ComputerState,
  ControlPlaneToRuntime,
  DockerLeftovers,
  DockerRemoveParams,
  DockerRemoveResult,
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
  RunThreadInfo,
  RunWebSearch,
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
  ScheduleHost,
  SendMessage,
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
import type { ComputerHost } from "@aven/agents/tools/computer";
import type { GoalRequest } from "@aven/agents/tools/define-goal";
import type { RunOutbox } from "./run-outbox";
import type { DurableRuns } from "./durable-runs";
import type { RunRecords } from "./run-records";
import type { DesktopViewers } from "./desktop-viewers";
import type { IdleRelease } from "./idle-release";
import type { ProcessEndWatch } from "./process-end-watch";
import type { SandboxDesktop } from "@anvia/sandbox";
import type { SandboxTunnel } from "@anvia/sandbox/remote";
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
  notes?: { memory: RunMemory; host: MemoryHost };
  cockpit?: { access: CockpitAccess; host: CockpitHost };
}) => Pick<Agent<unknown>, "generate">;

export type BotRepliesContext = {
  sandbox: ThreadWorkspaces;
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

export type RunInput = {
  agent: Agent<unknown>;
  compaction?: DurableAgentRegistration["compaction"];
  contextWindow?: number;
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

export type DockerRun = (
  args: string[],
  options?: { timeoutMs?: number },
) => Promise<CommandOutput>;

export type SetupInput = {
  docker: DockerRun;
  key: string;
  baseImage: string;
  image: string;
  root: string;
  logPath: string;
  runner: string;
  memoryMb: number;
  cpus: number;
  pidsLimit: number;
  platform?: string;
  runtime?: string;
  hostUser?: string;
  timeoutMs?: number;
};

export type ContainerBase = {
  name: string;
  label: string;
  runner: string;
  memoryMb: number;
  cpus: number;
  pidsLimit: number;
  platform?: string;
  runtime?: string;
};

export type ThreadRef = {
  id: string;
  organizationId?: string;
  forkOf?: string;
  projectId?: string;
  ownerId?: string;
};

export type EnvironmentsConfig = {
  image: string;
  platform?: string;
  runtime?: string;
  runner: string;
  memoryMb: number;
  cpus: number;
  pidsLimit: number;
  home: string;
  docker: DockerRun;
  git: Git;
  spareDelayMs?: number;
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

export type LeftoversOptions = {
  docker: DockerRun;
  runner: string;
  image: string;
  home: string;
  inUse(threadId: string): boolean;
  now?: () => number;
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

export type ConnectedMcp = {
  tools: AnyTool[];
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

export type DriverContext = {
  journal: Promise<DurableRuns>;
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

export type RunnerCallsContext = {
  sandbox: ThreadWorkspaces;
  boxes: Map<string, ThreadSandbox>;
  viewers: Pick<DesktopViewers, "call">;
  idle: Pick<IdleRelease, "schedule" | "starting" | "releaseNow">;
  update?: {
    start(release: string | undefined): void;
    busy(): string | undefined;
  };
  processEnds: Pick<ProcessEndWatch, "ignore">;
  steer(params: SteerParams): Promise<SteerResult>;
};

export type RuntimeOptions = {
  url: string;
  token: string;
  build?: string;
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

export type PreflightConfig = { image: string; platform?: string; runtime?: string };

export type HostCommands = { docker: DockerRun; git: Git };

export type SandboxConfig = {
  image: string;
  platform?: string;
  runtime?: string;
  home?: string;
  memoryMb?: number;
  cpus?: number;
  pidsLimit?: number;
  hostName?: string;
  connectTimeoutMs?: number;
  reachCheckAfterMs?: number;
  git?: Git;
  docker?: DockerRun;
  archivedKeepDays?: number;
  browserProfileKeepDays?: number;
};

export type AcquireOptions = {
  lazy?: boolean;
};

export type ThreadSandbox = {
  tools: readonly AnyTool[];
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
  desktop(threadId: string): SandboxDesktop | undefined;
  tunnel?(threadId: string): SandboxTunnel | undefined;
  shell?(
    threadId: string,
    sessionId: string,
  ): { argv: string[]; env: Record<string, string>; hangup: string[] } | undefined;
  workspace(threadId: string): Promise<string | undefined>;
  paths?(threadId: string): SandboxPaths;
  release(threadId: string): Promise<void>;
  putAway?(threadId: string): Promise<void>;
  leftovers?(): Promise<DockerLeftovers>;
  removeLeftovers?(request: DockerRemoveParams): Promise<DockerRemoveResult>;
  running?(): number;
  signInGithub?(threadId: string, github: RunGithub | undefined): Promise<void>;
  signInIdentity?(
    threadId: string,
    identity: RunIdentityCredential | undefined,
    controlPlane: string,
  ): Promise<void>;
  setProjectEnv?(threadId: string, env: readonly RunEnvVar[] | undefined): void;
  saveEnvironment?(thread: ThreadRef, access: RepoAccess): Promise<{ image: string }>;
  environmentSavedAt?(thread: ThreadRef, access: RepoAccess): Promise<string | null>;
  readonly artifacts?: ArtifactStore;
  readonly uploads?: UploadStore;
  readonly skills?: SkillStore;
  dispose(): Promise<void>;
}

export type BrowserProfile = { name: string; dir: string; shared: boolean };

export type BrowserProfilesOptions = { home: string; keepMs: number; now?: () => number };

export type ArchivedCleanupOptions = {
  home: string;
  keepMs: number;
  docker: DockerRun;
  inUse(threadId: string): boolean;
  now?: () => number;
};

export type FetchSkill = (digest: string) => Promise<Uint8Array>;

export type Snapshot = {
  key: string;
  image: string;
  baseImageId: string;
  createdAt: string;
  workspace: string;
  logPath: string;
};

export type CreateSubagent = (input: {
  type: SubagentType;
  id: string;
  tools: AnyTool[];
}) => Agent<unknown>;

export type TerminalShellInput = {
  container: string;
  sessionId: string;
  project: Readonly<Record<string, string>>;
};

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

export type HostReach = { ok: boolean; detail: string; skipped?: boolean };

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
  git?: Git;
};
