import type { COCKPIT_KINDS, TASK_PRIORITIES, TASK_STATUSES } from "./cockpit";
import type { LENS_CAPTURE_MODES } from "./lens";
import type { MCP_TARGETS } from "./mcp";
import type { MEMORY_SCOPES } from "./memory";
import type {
  AGENT_BACKENDS,
  CLOUD_PROVIDER_CONFIG_STATUSES,
  CLOUD_SANDBOX_STATES,
  DIFF_SCOPES,
  ENVIRONMENT_STATUSES,
  MACHINE_OPS,
  PROVIDERS,
  BOAT_MACHINE_TYPES,
  RUN_DRAIN_REASONS,
  RUNTIME_GITHUB_MODES,
  RUNTIME_PROVIDERS,
  MODEL_APIS,
} from "./runtime-wire";

export type LensCaptureMode = (typeof LENS_CAPTURE_MODES)[number];

export type ParsedBotPrompt = {
  id?: string;
  quoted?: string;
  from?: string;
  note?: boolean;
  text: string;
};

export type CodexAuthFile = {
  auth_mode?: string;
  OPENAI_API_KEY?: string | null;
  tokens: {
    id_token?: unknown;
    access_token: string;
    refresh_token: string;
    account_id?: string | null;
  };
  last_refresh?: string;
};

export type BotAttentionReason = "question" | "goal" | "schedule" | "message";

export type BotAttention = { reason: BotAttentionReason; since: string };

export type Bot = {
  id: string;
  name: string;
  handle: string;
  instruction: string;
  description: string;
  avatar: string;
  providerId: string | null;
  modelId: string | null;
  reasoningEffort: string | null;
  compactAfterTokens: number | null;
  hasComputer: boolean;
  runtimeId: string | null;
  isMain: boolean;
  attention: BotAttention | null;
  createdAt: string;
  updatedAt: string;
};

export type BotChatPeer = {
  name: string;
  handle: string;
  id?: string;
  direction: "to" | "from";
};

export type BotQuestion = QuestionPrompt & { providerKey?: ProviderKeyAsk };

export type BotChatQuote = {
  id: string;
  role: "user" | "bot";
  text: string;
  peer?: BotChatPeer;
};

export type BotChatMessage = {
  id: string;
  role: "user" | "bot";
  text: string;
  attachments?: MessageAttachment[];
  artifacts?: ToolArtifact[];
  peer?: BotChatPeer;
  questions?: BotQuestion[];
  quote?: BotChatQuote;
  reactions?: string[];
};

export type BotEvent =
  | { type: "snapshot"; messages: BotChatMessage[]; typing: boolean; activity?: string }
  | { type: "message"; message: BotChatMessage }
  | { type: "reaction"; messageId: string; emoji: string }
  | { type: "typing"; typing: boolean }
  | { type: "activity"; label: string | null }
  | { type: "error"; message: string };

export type TaskStatus = (typeof TASK_STATUSES)[number];

export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export type InboxItem = {
  id: string;
  title: string;
  body: string;
  tags: string[];
  done: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CockpitTask = {
  id: string;
  number: number;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  tags: string[];
  position: number;
  createdAt: string;
  updatedAt: string;
};

export type CockpitNote = {
  id: string;
  title: string;
  body: string;
  tags: string[];
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CockpitTag = {
  name: string;
  color: string | null;
  inbox: number;
  tasks: number;
  notes: number;
};

export type CockpitKind = (typeof COCKPIT_KINDS)[number];

export type CockpitAccess = "read" | "write";

export type CockpitFields = {
  title?: string;
  body?: string;
  tags?: string[];
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: string | null;
  done?: boolean;
  pinned?: boolean;
};

export type CockpitCommand =
  | {
      command: "list";
      kind: CockpitKind;
      tag?: string;
      query?: string;
      status?: TaskStatus;
      done?: boolean;
    }
  | { command: "get"; kind: CockpitKind; id: string }
  | { command: "tags" }
  | { command: "create"; kind: CockpitKind; fields: CockpitFields & { title: string } }
  | { command: "update"; kind: CockpitKind; id: string; fields: CockpitFields }
  | { command: "delete"; kind: CockpitKind; id: string }
  | { command: "convert"; id: string; fields?: CockpitFields };

export type GraphCommit = { sha: string; parents: readonly string[] };

export type GraphRow = { lane: number; up: number[]; through: number[]; down: number[] };

export type CommitGraph = { rows: GraphRow[]; lanes: number };

export type DiffLine = { type: "add" | "del" | "ctx"; text: string };

export type QuestionChoice = { label: string; value: string };

export type QuestionPrompt = {
  id: string;
  text: string;
  choices?: QuestionChoice[];
  allowCustom?: boolean;
};

export type QuestionAnswer = { questionId: string; value: string };

export type ToolArtifact = {
  name: string;
  mediaType: string;
  caption?: string;
  title?: string;
  size?: number;
};

export type SubagentPart = {
  index: number;
  description: string;
  type: string;
  status: "running" | "done" | "error";
  tools: ToolPart[];
  output?: string;
};

export type ToolPart = {
  id: string;
  name: string;
  target: string;
  status: "running" | "done" | "error";
  diff?: DiffLine[];
  output?: string;
  questions?: QuestionPrompt[];
  artifacts?: ToolArtifact[];
  subagents?: SubagentPart[];
};

export type SubagentEvent =
  | { type: "tool_start"; tool: Pick<ToolPart, "id" | "name" | "target" | "status"> }
  | { type: "tool_end"; id: string; status: "done" | "error" }
  | { type: "end"; status: "done" | "error"; output?: string };

export type ContextSegmentId =
  | "instructions"
  | "messages"
  | "toolResults"
  | "documents"
  | "tools"
  | "mcpTools"
  | "providerTools"
  | "outputSchema";

export type ContextSegment = { id: ContextSegmentId; tokens: number };

export type ContextUsage = {
  usedTokens: number;
  contextWindow?: number;
  segments?: ContextSegment[];
};

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
};

export type PlanLimitWindow = "five_hour" | "seven_day";

export type PlanLimitStatus = "allowed" | "allowed_warning" | "rejected";

export type PlanLimit = {
  window: PlanLimitWindow;
  status: PlanLimitStatus;
  percent: number;
  resetsAt?: number;
};

export type ThreadUsage = { totals: TokenUsage; context?: ContextUsage; limits?: PlanLimit[] };

export type MessagePart =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "tool"; tool: ToolPart };

export type MessageAttachment = { name: string; mediaType: string; size: number; image?: string };

export type MessageMention = { type: "file" | "skill"; name: string; from: number; to: number };

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  parts: MessagePart[];
  attachments?: MessageAttachment[];
  mentions?: MessageMention[];
  senderId?: string;
  workedMs?: number;
};

export type MessagesPage = { messages: ChatMessage[]; hidden: number };

export type QueuedSteer = {
  id: string;
  prompt: string;
  mentions?: MessageMention[];
  attachments?: MessageAttachment[];
  senderId?: string;
};

export type RunEvent =
  | {
      type: "snapshot";
      messages: ChatMessage[];
      hidden?: number;
      running: boolean;
      usage?: ThreadUsage;
      runningMs?: number;
      steers?: QueuedSteer[];
      error?: string;
    }
  | {
      type: "run_start";
      prompt: string;
      attachments?: MessageAttachment[];
      mentions?: MessageMention[];
      senderId?: string;
    }
  | { type: "run_resume" }
  | ({ type: "steer_queued" } & QueuedSteer)
  | ({ type: "steer" } & QueuedSteer)
  | { type: "steer_applied"; id: string }
  | { type: "steer_rejected"; id: string; reason?: string }
  | { type: "text"; delta: string }
  | { type: "reasoning"; delta: string }
  | { type: "tool_start"; tool: ToolPart }
  | {
      type: "tool_end";
      id: string;
      status: "done" | "error";
      output?: string;
      artifacts?: ToolArtifact[];
    }
  | { type: "usage"; turn: TokenUsage; context?: ContextUsage }
  | { type: "limits"; limits: PlanLimit[] }
  | { type: "subagent"; index: number; event: SubagentEvent }
  | { type: "done"; workedMs?: number }
  | { type: "error"; message: string };

export type ForkView = {
  id: string;
  title: string;
  running: boolean;
  archived: boolean;
  error: string | null;
  lastMessage: string;
  stopped?: boolean;
};

export type GoalPhase = "active" | "paused" | "blocked" | "complete" | "cleared";

export type GoalAction = "complete" | "blocked" | "pause" | "resume" | "clear";

export type BotGoalView = {
  objective: string;
  checks: string[];
  phase: GoalPhase;
  blockedReason: string | null;
  round: number;
  maxRounds: number;
};

export type McpTarget = (typeof MCP_TARGETS)[number];

export type BotMcpView = {
  id: string;
  name: string;
  url: string;
  target: McpTarget;
  enabled: boolean;
  headerNames: string[];
  lastError: string | null;
};

export type MemoryScope = (typeof MEMORY_SCOPES)[number];

export type MemoryCommand =
  | { command: "view"; path: string; viewRange?: [number, number] }
  | { command: "create"; path: string; fileText: string }
  | { command: "str_replace"; path: string; oldStr: string; newStr: string }
  | { command: "insert"; path: string; insertLine: number; insertText: string }
  | { command: "delete"; path: string }
  | { command: "rename"; oldPath: string; newPath: string };

export type MemoryListing = { name: string; description: string };

export type MemoryFolder = {
  scope: MemoryScope;
  projectSlug?: string;
  notes: MemoryListing[];
  more?: number;
};

export type RunMemory = { folders: MemoryFolder[]; writable: boolean };

export type MemoryNoteView = {
  id: string;
  scope: MemoryScope;
  projectId: string | null;
  botId: string | null;
  name: string;
  description: string;
  body: string;
  updatedAt: string;
};

export type MemorySource = "person" | "thread" | "bot" | "app";

export type MemoryEventView = {
  id: string;
  scope: MemoryScope;
  projectId: string | null;
  botId: string | null;
  name: string;
  action: "created" | "updated" | "removed" | "renamed";
  from: string | null;
  source: MemorySource;
  threadId: string | null;
  at: string;
};

export type BotProviderView = {
  id: string;
  kind: Provider;
  name: string;
  baseUrl: string | null;
  modelId: string | null;
  isDefault: boolean;
  hasKey: boolean;
};

export type ProviderKeyAsk = { providerId: string; name: string };

export type ComputerState = "asleep" | "waking" | "awake";

export type RunThreadInfo = {
  id: string;
  organizationId: string;
  forkOf?: string;
  projectId?: string;
  ownerId?: string;
  machine?: string;
  provider?: RuntimeProviderKind;
};

export type Provider = (typeof PROVIDERS)[number];

export type ModelApi = (typeof MODEL_APIS)[number];

export type CompatibleVendorId = "openrouter" | "groq" | "deepseek" | "mistral" | "xai" | "ollama";

export type CompatibleVendor = { baseUrl: string; catalog: string | null };

export type RunOutcome = "response" | "blocked" | "interaction" | "error";

export type AgentBackendKind = (typeof AGENT_BACKENDS)[number];

export type AgentBackendCapability = "question" | "restart" | "steering" | "goals" | "compaction";

export type AgentBackendCapabilities = Readonly<Record<AgentBackendCapability, boolean>>;

export type RuntimeProviderKind = (typeof RUNTIME_PROVIDERS)[number];

export type CloudSandboxState = (typeof CLOUD_SANDBOX_STATES)[number];

export type CloudProviderConfigStatus = (typeof CLOUD_PROVIDER_CONFIG_STATUSES)[number];

export type RunDrainReason = (typeof RUN_DRAIN_REASONS)[number];

export type BoatMachineType = (typeof BOAT_MACHINE_TYPES)[number];

export type RuntimeGithubMode = (typeof RUNTIME_GITHUB_MODES)[number];

export type RunModel = {
  provider: ModelApi;
  modelId?: string;
  reasoningEffort?: string;
  effortLevels?: string[];
  contextWindow?: number;
  gatewayPath: string;
  gatewayToken: string;
};

export type Reply = {
  type: "reply";
  id: string;
  ok: boolean;
  result?: unknown;
  error?: string;
  code?: string;
};

export type ComputerCallMethod = "computer.status" | "computer.wake";

export type ComputerInfo = { state: ComputerState };

export type ComputerCallParams = { threadId: string; bot?: boolean };

export type DiffCallMethod = "diff.get";

export type DiffScope = (typeof DIFF_SCOPES)[number];

export type DiffSummary = {
  files: number;
  additions: number;
  deletions: number;
};

export type ThreadDiff = {
  patch: string;
  truncated: boolean;
  branch?: string | null;
  summary?: DiffSummary;
};

export type FilesCallMethod = "files.list" | "files.read" | "files.search";

export type FileEntry = { name: string; type: "file" | "directory" };

export type FileContent =
  | { kind: "text"; text: string; size: number; truncated: boolean }
  | { kind: "binary"; size: number }
  | { kind: "missing" };

export type ArtifactsCallMethod = "artifacts.read";

export type ArtifactContent = { mediaType: string; data: string };

export type ThreadAction = { name: string; kind: "run" | "prompt" };

export type ActionsCallMethod = "actions.run";

export type ActionRunParams = { threadId: string; command: string };

export type ActionRunResult = { process: ProcessView };

export type ProcessesCallMethod = "processes.list" | "processes.stop" | "processes.logs";

export type ProcessView = {
  id: string;
  command: string;
  cwd?: string;
  status: "running" | "exited" | "stopped";
  exitCode?: number;
  startedAt: string;
  endedAt?: string;
};

export type ProcessLogs = { stdout: string; stderr: string; truncated: boolean };

export type RunCallMethod = "run.steer";

export type SteerResult =
  | { status: "queued" }
  | { status: "closed" }
  | { status: "refused"; reason: string };

export type SandboxCallMethod = "sandbox.release";

export type MachineCallMethod = "machine.call";

export type ProcessWatchPhase = "arm" | "settle" | "suspend";

export type ProcessWatchParams = { threadId: string; phase: ProcessWatchPhase };

export type ProcessWatchCallMethod = "process.watch";

export type MachineOp = (typeof MACHINE_OPS)[number];

export type MachineCallParams = { threadId: string; op: MachineOp; args?: unknown };

export type MachineRelayParams = {
  op: MachineOp;
  args?: unknown;
} & ({ runId: string } | { replyId: string });

export type RunnerSelfCallMethod =
  | "runner.update"
  | "folders.list"
  | "folders.create"
  | "folders.clone"
  | "folders.files"
  | "folders.readme"
  | "folders.commits";

export type FoldersListParams = { path?: string };

export type FolderEntry = { name: string; path: string; git: boolean };

export type FoldersListResult = {
  path: string | null;
  parent: string | null;
  folders: FolderEntry[];
};

export type FoldersCreateParams = { path: string; name: string };

export type FoldersCreateResult = { path: string };

export type FoldersCloneParams = { repository: string };

export type FoldersCloneResult = { path: string };

export type FoldersFilesParams = { folder: string; path?: string };

export type FolderFileEntry = { name: string; path: string; type: "file" | "directory" };

export type FoldersFilesResult = { entries: FolderFileEntry[] };

export type FoldersReadmeParams = { folder: string };

export type FolderReadme = { name: string; path: string; text: string; truncated: boolean };

export type FoldersReadmeResult = { readme: FolderReadme | null };

export type FoldersCommitsParams = { folder: string; page?: number };

export type FolderCommit = {
  sha: string;
  message: string;
  author: string | null;
  authorAvatar: null;
  date: string;
  parents: string[];
  refs: string[];
  tags: string[];
};

export type FoldersCommitsResult = { commits: FolderCommit[]; hasMore: boolean };

export type RunnerUpdateParams = { release?: string };

export type RunnerUpdateResult =
  | { status: "started" }
  | { status: "busy"; reason: string }
  | { status: "unsupported" };

export type SandboxReleaseParams = { threadId: string };

export type GitCenterCallMethod =
  | "git.snapshot"
  | "git.commitDiff"
  | "git.workspaceStatus"
  | "git.reflog"
  | "git.action";

export type GitWorkspaceTarget =
  | { kind: "project"; folder: string }
  | { kind: "thread"; threadId: string };

export type GitBranchInfo = {
  name: string;
  sha: string;
  current: boolean;
  upstream: string | null;
  ahead: number;
  behind: number;
  gone: boolean;
  merged: boolean;
  lastCommitDate: string | null;
};

export type GitRemoteRef = {
  remote: string;
  name: string;
  fullName: string;
  sha: string;
};

export type GitTagInfo = {
  name: string;
  sha: string;
  date: string | null;
};

export type GitStashInfo = {
  index: number;
  ref: string;
  message: string;
  sha: string;
  date: string;
};

export type GitWorktreeInfo = {
  path: string;
  sha: string | null;
  branch: string | null;
  detached: boolean;
  bare: boolean;
  locked: boolean;
  prunable: boolean;
  isMain: boolean;
};

export type GitConflictOperation = "merge" | "rebase" | "cherry-pick" | "revert";

export type GitConflictState = {
  operation: GitConflictOperation;
  files: string[];
};

export type GitCommitEntry = {
  sha: string;
  shortSha: string;
  message: string;
  body: string;
  author: string | null;
  authorEmail: string | null;
  date: string;
  parents: string[];
  refs: string[];
  remoteRefs: string[];
  tags: string[];
};

export type GitWipSummary = {
  staged: number;
  unstaged: number;
  untracked: number;
  conflicted: number;
  additions: number;
  deletions: number;
};

export type GitThreadWorkspaceSummary = {
  threadId: string;
  branch: string | null;
  headSha: string | null;
  wip: GitWipSummary;
  conflicts: GitConflictState | null;
};

export type GitSnapshotParams = {
  folder: string;
  page?: number;
  limit?: number;
  branch?: string;
  search?: string;
  author?: string;
  path?: string;
  threadIds?: string[];
};

export type GitSnapshotResult = {
  isRepo: boolean;
  root: string | null;
  headBranch: string | null;
  headSha: string | null;
  detached: boolean;
  defaultBranch: string | null;
  branches: GitBranchInfo[];
  remotes: GitRemoteRef[];
  tags: GitTagInfo[];
  stashes: GitStashInfo[];
  worktrees: GitWorktreeInfo[];
  conflicts: GitConflictState | null;
  wip: GitWipSummary;
  commits: GitCommitEntry[];
  hasMore: boolean;
  threadWorkspaces: GitThreadWorkspaceSummary[];
};

export type GitCommitDiffParams = {
  folder: string;
  sha: string;
};

export type GitCommitDiffResult = {
  sha: string;
  message: string;
  body: string;
  author: string | null;
  authorEmail: string | null;
  date: string;
  parents: string[];
  patch: string;
  truncated: boolean;
  additions: number;
  deletions: number;
  filesChanged: number;
};

export type GitWorkspaceFileStatus =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "copied"
  | "untracked"
  | "conflicted";

export type GitWorkspaceStatusFile = {
  path: string;
  oldPath: string | null;
  status: GitWorkspaceFileStatus;
  staged: boolean;
  unstaged: boolean;
};

export type GitWorkspaceStatusParams = {
  target: GitWorkspaceTarget;
  filePath?: string;
  staged?: boolean;
};

export type GitWorkspaceStatusResult = {
  branch: string | null;
  headSha: string | null;
  detached: boolean;
  conflicts: GitConflictState | null;
  files: GitWorkspaceStatusFile[];
  patch: string;
  truncated: boolean;
  wip: GitWipSummary;
};

export type GitReflogEntry = {
  index: number;
  selector: string;
  sha: string;
  shortSha: string;
  action: string;
  message: string;
  date: string;
};

export type GitReflogParams = {
  target: GitWorkspaceTarget;
  limit?: number;
};

export type GitReflogResult = {
  entries: GitReflogEntry[];
};

export type GitActionAuth = {
  token: string;
  login: string;
  name?: string | null;
};

export type GitActionPayload =
  | { op: "fetch"; prune?: boolean }
  | { op: "pull"; strategy?: "merge" | "rebase" | "ff-only" }
  | { op: "push"; branch?: string; forceWithLease?: boolean; setUpstream?: boolean }
  | { op: "checkout"; ref: string; createBranch?: string }
  | { op: "branch.create"; name: string; startPoint?: string; checkout?: boolean }
  | { op: "branch.rename"; oldName: string; newName: string }
  | { op: "branch.delete"; name: string; force?: boolean; deleteRemote?: boolean }
  | { op: "stage"; paths?: string[]; all?: boolean }
  | { op: "unstage"; paths?: string[]; all?: boolean }
  | { op: "discard"; paths?: string[]; all?: boolean }
  | { op: "commit"; message: string; amend?: boolean; signoff?: boolean }
  | { op: "stash.push"; message?: string; includeUntracked?: boolean }
  | { op: "stash.apply"; index: number }
  | { op: "stash.pop"; index: number }
  | { op: "stash.drop"; index: number }
  | { op: "merge"; ref: string; noFf?: boolean }
  | { op: "rebase"; onto: string }
  | { op: "cherryPick"; sha: string }
  | { op: "revert"; sha: string }
  | { op: "conflict.abort" }
  | { op: "conflict.continue" }
  | { op: "reset"; ref: string; mode: "soft" | "mixed" | "hard" }
  | { op: "worktree.prune" }
  | { op: "worktree.remove"; path: string; force?: boolean }
  | { op: "branches.cleanup"; branches: string[]; force?: boolean };

export type GitActionParams = {
  target: GitWorkspaceTarget;
  action: GitActionPayload;
  auth?: GitActionAuth;
};

export type GitActionResult = {
  ok: boolean;
  summary: string;
  conflicts?: GitConflictState | null;
  output?: string;
};

export type RunnerCallMethod =
  | ComputerCallMethod
  | DiffCallMethod
  | FilesCallMethod
  | ArtifactsCallMethod
  | ProcessesCallMethod
  | ActionsCallMethod
  | RunCallMethod
  | SandboxCallMethod
  | MachineCallMethod
  | ProcessWatchCallMethod
  | RunnerSelfCallMethod
  | GitCenterCallMethod;

export type DiffGetParams = {
  threadId: string;
  scope: DiffScope;
  summaryOnly?: boolean;
  branchOnly?: boolean;
};

export type FilesCallParams = { threadId: string; path: string };

export type FilesSearchParams = { threadId: string; query: string };

export type ArtifactsReadParams = { threadId: string; name: string };

export type ProcessesCallParams = { threadId: string; processId?: string };

export type RunAttachment = MessageAttachment & { data: string };

export type RunSkill = { name: string; description: string; digest: string };

export type RunMcpServer = {
  id: string;
  name: string;
  url: string;
  headers: Record<string, string>;
  allowLocal: boolean;
};

export type RunGithub = { token: string; id: number; login: string; name: string | null };

export type RunEnvVar = { name: string; value: string; secret?: boolean };

export type RunIdentityCredential = { credential: string };

export type RunWebSearch = { apiKey: string };

export type RunLens = {
  baseUrl: string;
  publicKey: string;
  secretKey: string;
  captureMode?: LensCaptureMode;
};

export type RunSecrets = {
  env?: RunEnvVar[];
  github?: RunGithub;
  identity?: RunIdentityCredential;
  mcp?: RunMcpServer[];
  gatewayToken?: string;
  webSearch?: RunWebSearch;
  claudeToken?: string;
  codexToken?: string;
  lens?: RunLens;
};

export type RunModelOptions = {
  model?: RunModel;
  backend?: AgentBackendKind;
  claudeToken?: string;
  claudeModel?: string;
  claudeEffort?: string;
  codexToken?: string;
  codexModel?: string;
  codexEffort?: string;
};

export type RunContextOptions = {
  skills?: RunSkill[];
  mcp?: RunMcpServer[];
  webSearch?: RunWebSearch;
  lens?: RunLens;
  memory?: RunMemory;
  cockpit?: CockpitAccess;
};

export type RunExecutionOptions = RunModelOptions &
  RunContextOptions & {
    github?: RunGithub;
    env?: RunEnvVar[];
    identity?: RunIdentityCredential;
  };

export type BotReplyInfo = {
  id: string;
  name: string;
  handle: string;
  instruction: string;
  description: string;
  compactAfterTokens?: number;
  canCreateBots: boolean;
  peers: BotPeer[];
  timezone: string;
};

export type BotReplyProject = { id: string; slug: string; repository: string; brief?: string };

export type BotPeer = { handle: string; name: string; description: string };

export type ControlPlaneToRuntime =
  | ({
      type: "run.start";
      runId: string;
      thread: RunThreadInfo;
      prompt: string;
      compact?: boolean;
      attachments?: RunAttachment[];
      mentions?: MessageMention[];
    } & RunExecutionOptions)
  | ({
      type: "run.resume";
      runId: string;
      thread: RunThreadInfo;
      continuation: unknown;
      response: unknown;
    } & RunExecutionOptions)
  | { type: "run.cancel"; runId: string; reason: string }
  | { type: "run.drain"; runId: string; reason: RunDrainReason }
  | ({
      type: "bot.reply";
      replyId: string;
      bot: BotReplyInfo;
      prompt: string;
      attachments?: RunAttachment[];
      context?: string;
      projects?: BotReplyProject[];
      machine?: string;
    } & RunModelOptions &
      RunContextOptions)
  | { type: "bot.cancel"; replyId: string; reason: string }
  | { type: "run.attach"; runId: string; after: number; secrets?: RunSecrets }
  | { type: "run.ack"; runId: string }
  | { type: "terminal.open"; viewerId: string; threadId: string; cols: number; rows: number }
  | { type: "terminal.resize"; viewerId: string; cols: number; rows: number }
  | { type: "terminal.close"; viewerId: string }
  | { type: "port.open"; viewerId: string; runtimeId: string; port: number }
  | { type: "port.close"; viewerId: string }
  | {
      type: "call";
      id: string;
      method: RunnerCallMethod;
      params: unknown;
    }
  | Reply;

export type HostStats = {
  cores: number;
  cpuPercent: number | null;
  memoryUsedBytes: number;
  memoryTotalBytes: number;
  diskUsedBytes: number;
  diskTotalBytes: number;
  sandboxes: number;
};

export type ReportedStats = HostStats & { reportedAt: string };

export type ProcessEnded = {
  threadId: string;
  processId: string;
  command: string;
  status: string;
  exitCode: number | null;
  ranSeconds: number;
  stdout: string;
  stderr: string;
};

export type RunnerGithub = { login: string | null };

export type RuntimeToControlPlane =
  | {
      type: "hello";
      version: number;
      runs: string[];
      build?: string;
      canUpdate?: boolean;
      host?: boolean;
      dirs?: string[];
      backends?: string[];
      guests?: string[];
      github?: RunnerGithub;
    }
  | { type: "host.stats"; stats: HostStats }
  | ({ type: "process.ended" } & ProcessEnded)
  | { type: "run.event"; runId: string; seq: number; event: RunEvent }
  | {
      type: "run.end";
      runId: string;
      seq: number;
      outcome: RunOutcome;
      error?: string;
      continuation?: unknown;
    }
  | { type: "call"; id: string; method: CallMethod; params: unknown }
  | { type: "bot.say"; replyId: string; text: string; quote?: string; files?: ToolArtifact[] }
  | { type: "bot.end"; replyId: string; error?: string }
  | { type: "bot.activity"; replyId: string; label: string | null }
  | { type: "terminal.opened"; viewerId: string }
  | { type: "terminal.closed"; viewerId: string; reason: string }
  | { type: "port.opened"; viewerId: string }
  | { type: "port.closed"; viewerId: string; reason: string }
  | Reply;

export type MemoryCallMethod = "memory.append" | "memory.notes";

export type CockpitCallMethod = "cockpit.read";

export type ForkCallMethod = "fork.start" | "fork.status";

export type RepoCallMethod = "repo.access" | "repo.folder";

export type SkillsCallMethod = "skills.get";

export type BotCallMethod =
  | "bot.memory"
  | "bot.create"
  | "bot.delete"
  | "bot.update"
  | "bot.send"
  | "bot.react"
  | "bot.question"
  | "bot.schedule"
  | "bot.goal"
  | "bot.skill"
  | "bot.mcp"
  | "bot.provider"
  | "bot.thread"
  | "bot.project"
  | "bot.notes"
  | "bot.cockpit"
  | "bot.api";

export type McpReportCallMethod = "mcp.report";

export type EnvironmentCallMethod = "environment.save" | "environment.read";

export type EnvironmentStatus = (typeof ENVIRONMENT_STATUSES)[number];
export type EnvironmentSaveParams = { runId: string; setupDigest: string };
export type EnvironmentSaved = { status: EnvironmentStatus; expiresAt: string | null };
export type EnvironmentReadParams = { runId: string };
export type EnvironmentView = {
  status: EnvironmentStatus;
  provider: RuntimeProviderKind;
  setupDigest: string;
  savedAt: string | null;
  expiresAt: string | null;
} | null;

export type CodexAuthCallMethod = "codex.auth";

export type CodexAuthParams = { previous: string; token: string };

export type CallMethod =
  | MemoryCallMethod
  | CockpitCallMethod
  | ForkCallMethod
  | RepoCallMethod
  | SkillsCallMethod
  | McpReportCallMethod
  | EnvironmentCallMethod
  | CodexAuthCallMethod
  | MachineCallMethod
  | BotCallMethod;

export type RepoAccess = {
  cloneUrl: string;
  defaultBranch: string;
  token: string;
};

export type RepoAccessParams = { runId: string };

export type SkillsGetParams = { runId: string; digest: string };

export type McpConnectResult = { id: string; error?: string };

export type McpReportParams = { runId: string; results: McpConnectResult[] };

export type BotMcpParams = { replyId: string } & (
  | { op: "list" }
  | {
      op: "add";
      name: string;
      url: string;
      headers?: { name: string; value: string }[];
      target?: McpTarget;
    }
  | {
      op: "update";
      id: string;
      name?: string;
      url?: string;
      headers?: { name: string; value: string }[];
      target?: McpTarget;
      enabled?: boolean;
    }
  | { op: "remove"; id: string }
  | { op: "report"; results: McpConnectResult[] }
);

export type BotMcped = BotMcpView | BotMcpView[] | null;

export type BotProviderParams = { replyId: string } & (
  | { op: "list" }
  | {
      op: "add";
      kind: Provider;
      name: string;
      baseUrl?: string;
      modelId?: string;
      isDefault?: boolean;
    }
  | {
      op: "update";
      id: string;
      name?: string;
      baseUrl?: string;
      modelId?: string;
      isDefault?: true;
    }
  | { op: "remove"; id: string }
  | { op: "models"; id: string }
  | { op: "askKey"; id: string }
);

export type BotProvided =
  | BotProviderView
  | BotProviderView[]
  | { models: string[] }
  | ProviderKeyAsk
  | null;

export type ThreadModelChoice = { providerId?: string; modelId?: string; reasoningEffort?: string };

export type BotThreadParams = { replyId: string } & (
  | { op: "projects" }
  | { op: "list"; projectId?: string; archived?: boolean }
  | { op: "get"; id: string }
  | ({ op: "start"; projectId: string; prompt: string; title?: string } & ThreadModelChoice)
  | ({ op: "continue"; id: string; prompt: string } & ThreadModelChoice)
  | { op: "archive"; id: string; archived?: boolean }
  | { op: "stop"; id: string }
  | { op: "answer"; id: string; answers: QuestionAnswer[] }
);

export type BotProjectParams = { replyId: string } & (
  | { op: "folder"; projectId: string; path?: string }
  | { op: "file"; projectId: string; path: string }
);

export type BotProjectEntry = FolderFileEntry;

export type BotProjected =
  | { entries: BotProjectEntry[] }
  | { path: string; text: string; truncated: boolean };

export type BotThreaded = BotProjectView[] | BotThreadView[] | BotThreadDetail | BotThreadView;

export type BotApiMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type BotApiRequest =
  | { op: "search"; query?: string }
  | {
      op: "call";
      method: BotApiMethod;
      path: string;
      body?: unknown;
      organizationId?: string;
      confirmed?: boolean;
    };

export type BotApiParams = { replyId: string } & BotApiRequest;

export type BotApiRoute = {
  method: BotApiMethod;
  path: string;
  tier: "read" | "change" | "confirm";
  body?: unknown;
};

export type BotApiResult =
  | { routes: BotApiRoute[]; organizations: { id: string; name: string }[] }
  | { status: number; body: unknown };

export type BotSkillParams = { replyId: string; digest: string };

export type SkillArchive = { data: string };

export type MemoryNotesParams = { runId: string; command: MemoryCommand };

export type BotNotesParams = { replyId: string; command: MemoryCommand };

export type CockpitReadParams = { runId: string; command: CockpitCommand };

export type ForkStartParams = { runId: string; task: string; context: string; title?: string };

export type ForkStatusParams = { runId: string; id: string; stop?: boolean };

export type BotCockpitParams = { replyId: string; command: CockpitCommand };

export type MemoryAppendParams = {
  runId: string;
  turn: number;
  messages: unknown[];
};

export type BotMemoryParams = { replyId: string } & (
  | { op: "load" }
  | { op: "append"; runId: string; turn: number; messages: unknown[] }
  | { op: "snapshot" }
  | {
      op: "replacePrefix";
      runId: string;
      revision: string;
      messageCount: number;
      replacement: unknown;
    }
);

export type BotCreateParams = {
  replyId: string;
  name: string;
  instruction: string;
  description?: string;
};

export type BotUpdateParams = {
  replyId: string;
  name?: string;
  description?: string;
  instruction?: string;
};

export type BotUpdated = { name: string; description: string };

export type BotSendParams = { replyId: string; to: string; text: string };

export type BotSent = { handle: string; name: string };

export type BotReactParams = { replyId: string; messageId: string; emoji: string };

export type BotReacted = { messageId: string };

export type BotQuestionParams = { replyId: string; questions: BotQuestion[] };

export type BotQuestioned = { relayed?: { handle: string; name: string; text: string } };

export type BotScheduleParams = { replyId: string } & (
  | { op: "list" }
  | {
      op: "create";
      name: string;
      cron: string;
      prompt: string;
      timezone?: string;
      bot?: string;
    }
  | {
      op: "update";
      id: string;
      name?: string;
      cron?: string;
      prompt?: string;
      timezone?: string;
      enabled?: boolean;
      bot?: string;
    }
  | { op: "delete"; id: string }
);

export type BotScheduled = BotScheduleView | BotScheduleView[] | null;

export type BotGoalParams = { replyId: string } & (
  | { op: "get" }
  | { op: "start"; objective: string; checks: string[]; maxRounds?: number }
  | { op: "update"; action: GoalAction; reason?: string }
);

export type BotGoaled = BotGoalView | null;

export type BotCreated = { id: string; name: string; handle: string };

export type BotDeleteParams = { replyId: string; handle: string };

export type BotDeleted = { name: string; handle: string };

export type RuntimeCalls = {
  "bot.memory": { params: BotMemoryParams; result: unknown };
  "bot.create": { params: BotCreateParams; result: BotCreated };
  "bot.delete": { params: BotDeleteParams; result: BotDeleted };
  "bot.update": { params: BotUpdateParams; result: BotUpdated };
  "bot.send": { params: BotSendParams; result: BotSent };
  "bot.react": { params: BotReactParams; result: BotReacted };
  "bot.question": { params: BotQuestionParams; result: BotQuestioned };
  "bot.schedule": { params: BotScheduleParams; result: BotScheduled };
  "bot.goal": { params: BotGoalParams; result: BotGoaled };
  "bot.skill": { params: BotSkillParams; result: SkillArchive };
  "bot.mcp": { params: BotMcpParams; result: BotMcped };
  "bot.provider": { params: BotProviderParams; result: BotProvided };
  "bot.thread": { params: BotThreadParams; result: BotThreaded };
  "bot.project": { params: BotProjectParams; result: BotProjected };
  "bot.notes": { params: BotNotesParams; result: string };
  "memory.notes": { params: MemoryNotesParams; result: string };
  "bot.cockpit": { params: BotCockpitParams; result: string };
  "bot.api": { params: BotApiParams; result: BotApiResult };
  "cockpit.read": { params: CockpitReadParams; result: string };
  "fork.start": { params: ForkStartParams; result: { id: string; title: string } };
  "fork.status": { params: ForkStatusParams; result: ForkView };
  "repo.access": { params: RepoAccessParams; result: RepoAccess };
  "repo.folder": { params: RepoAccessParams; result: { directory: string | null } };
  "memory.append": { params: MemoryAppendParams; result: null };
  "skills.get": { params: SkillsGetParams; result: SkillArchive };
  "mcp.report": { params: McpReportParams; result: null };
  "environment.save": { params: EnvironmentSaveParams; result: EnvironmentSaved };
  "environment.read": { params: EnvironmentReadParams; result: EnvironmentView };
  "codex.auth": { params: CodexAuthParams; result: null };
  "machine.call": { params: MachineRelayParams; result: unknown };
};

export type ScheduleStatus = "started" | "late" | "busy" | "missed" | "failed";

export type BotScheduleView = {
  id: string;
  bot: string;
  name: string;
  cron: string;
  timezone: string;
  prompt: string;
  enabled: boolean;
  nextRun: string | null;
  lastRun: string | null;
  lastStatus: ScheduleStatus | null;
};

export type BotProjectView = {
  id: string;
  name: string;
  repository: string;
  defaultBranch: string;
};

export type BotThreadPullRequest = {
  number: number;
  url: string;
  title: string;
  state: "open" | "closed" | "merged";
};

export type BotThreadView = {
  id: string;
  title: string;
  projectId: string;
  repository: string;
  state: "open" | "snoozed" | "archived";
  mine: boolean;
  createdBy?: string;
  running: boolean;
  lastActivityAt?: string;
  awaitingAnswer: boolean;
  pullRequests: BotThreadPullRequest[];
  updatedAt: string;
};

export type BotThreadTurn = {
  role: "user" | "assistant";
  text: string;
  tools?: string[];
};

export type BotPullRequestCheck = {
  state: "passing" | "failing" | "pending" | "none";
  failing: string[];
  failingMore: number;
};

export type BotPullRequestReview = {
  state: "approved" | "changes_requested" | "commented" | "none";
  by: { login: string; state: "approved" | "changes_requested" | "commented" | "dismissed" }[];
  requested: string[];
};

export type BotReviewComment = { author: string | null; path: string; text: string };

export type BotPullRequestFile = {
  path: string;
  status: string;
  additions: number;
  deletions: number;
};

export type BotPullRequestDetail = {
  number: number;
  url: string;
  title: string;
  state: "open" | "draft" | "merged" | "closed";
  mergeable?: boolean | null;
  checks?: BotPullRequestCheck;
  review?: BotPullRequestReview;
  unresolvedComments?: BotReviewComment[];
  unresolvedCommentsMore?: number;
  files?: BotPullRequestFile[];
  filesMore?: number;
  additions?: number;
  deletions?: number;
  omitted?: string[];
};

export type BotThreadQuestion = {
  id: string;
  text: string;
  choices: QuestionChoice[];
  allowCustom: boolean;
};

export type BotThreadDetail = BotThreadView & {
  turns: BotThreadTurn[];
  earlier: number;
  question?: string;
  questions?: BotThreadQuestion[];
  pullRequestDetails?: BotPullRequestDetail[];
  pullRequestsNote?: string;
};

export type ContinuationPatch = "attached" | "none" | "unavailable";

export type ClaudeEffort = "low" | "medium" | "high" | "xhigh" | "max";

export type CodexEffort = "low" | "medium" | "high" | "xhigh" | "max" | "ultra";

export type AccessPermission = "read" | "change" | "destructive";

export type AccessToken = {
  id: string;
  name: string;
  hint: string;
  permissions: AccessPermission[];
  lastUsedAt: string | null;
  createdAt: string;
};

export type AccessTokenCreated = AccessToken & { token: string };

export type WebhookStatus = "delivered" | "busy" | "failed";

export type Webhook = {
  id: string;
  name: string;
  hint: string;
  path: string;
  enabled: boolean;
  lastDeliveryAt: string | null;
  lastStatus: WebhookStatus | null;
  createdAt: string;
};

export type WebhookCreated = Webhook & { token: string; urlPath: string };

export type AnnouncementTemplate = "waves" | "violet" | "pink" | "amber";

export type SandboxProviderName = "boat" | "spaces" | "lizard";

export type DecisionKind = "jev" | "jev-openrouter";

export type SmallModelProvider = "anthropic" | "openai" | "gemini";

export type PlatformConfig = {
  registrationEnabled: boolean;
  githubLogin: boolean;
  emailLogin: boolean;
  claudeBackend: boolean;
  codexBackend: boolean;
  lens: boolean;
  isOwner: boolean;
  platformSettings: boolean;
  manageUrl?: string | null;
};
