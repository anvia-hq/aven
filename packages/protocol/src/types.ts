import type { COCKPIT_KINDS, TASK_PRIORITIES, TASK_STATUSES } from "./cockpit";
import type { MCP_TARGETS } from "./mcp";
import type { MEMORY_SCOPES } from "./memory";
import type { DIFF_SCOPES, PROVIDERS } from "./runtime-wire";

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
  isMain: boolean;
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

export type BotChatMessage = {
  id: string;
  role: "user" | "bot";
  text: string;
  attachments?: MessageAttachment[];
  peer?: BotChatPeer;
  questions?: BotQuestion[];
};

export type BotEvent =
  | { type: "snapshot"; messages: BotChatMessage[]; typing: boolean }
  | { type: "message"; message: BotChatMessage }
  | { type: "typing"; typing: boolean }
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
  | { command: "delete"; kind: CockpitKind; id: string };

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

export type ToolArtifact = { name: string; mediaType: string; caption?: string };

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

export type ContextUsage = { usedTokens: number; contextWindow: number };

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
};

export type ThreadUsage = { totals: TokenUsage; context?: ContextUsage };

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
};

export type QueuedSteer = { id: string; prompt: string; mentions?: MessageMention[] };

export type RunEvent =
  | {
      type: "snapshot";
      messages: ChatMessage[];
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
  | { type: "subagent"; index: number; event: SubagentEvent }
  | { type: "done" }
  | { type: "error"; message: string };

export type ForkView = {
  id: string;
  title: string;
  running: boolean;
  archived: boolean;
  error: string | null;
  lastMessage: string;
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

export type MemorySource = "person" | "thread" | "bot";

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

export type RunThreadInfo = {
  id: string;
  organizationId: string;
  forkOf?: string;
};

export type Provider = (typeof PROVIDERS)[number];

export type RunOutcome = "response" | "blocked" | "interaction" | "error";

export type RunModel = {
  provider: Provider;
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

export type DesktopControl = {
  held: boolean;
  holder?: string;
  expiresAt?: string;
};

export type DesktopInfo = {
  state: "running" | "stopped" | "starting" | "restarting" | "failed";
  width: number;
  height: number;
  control: DesktopControl;
};

export type DesktopCallMethod =
  | "desktop.status"
  | "desktop.takeover"
  | "desktop.release"
  | "desktop.wake";

export type DiffCallMethod = "diff.get";

export type DiffScope = (typeof DIFF_SCOPES)[number];

export type ThreadDiff = {
  patch: string;
  truncated: boolean;
};

export type FilesCallMethod = "files.list" | "files.read" | "files.search";

export type FileEntry = { name: string; type: "file" | "directory" };

export type FileContent =
  | { kind: "text"; text: string; size: number; truncated: boolean }
  | { kind: "binary"; size: number }
  | { kind: "missing" };

export type ArtifactsCallMethod = "artifacts.read";

export type ArtifactContent = { mediaType: string; data: string };

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

export type RunnerSelfCallMethod = "runner.update";

export type RunnerUpdateParams = { release?: string };

export type RunnerUpdateResult =
  | { status: "started" }
  | { status: "busy"; reason: string }
  | { status: "unsupported" };

export type SandboxReleaseParams = { threadId: string };

export type SandboxReleaseResult = { released: boolean };

export type RunnerCallMethod =
  | DesktopCallMethod
  | DiffCallMethod
  | FilesCallMethod
  | ArtifactsCallMethod
  | ProcessesCallMethod
  | RunCallMethod
  | SandboxCallMethod
  | RunnerSelfCallMethod;

export type DesktopCallParams = {
  threadId: string;
  holder?: string;
  leaseMs?: number;
  force?: boolean;
  bot?: boolean;
};

export type DiffGetParams = { threadId: string; scope: DiffScope };

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

export type BotPeer = { handle: string; name: string; description: string };

export type ControlPlaneToRuntime =
  | {
      type: "run.start";
      runId: string;
      thread: RunThreadInfo;
      prompt: string;
      compact?: boolean;
      attachments?: RunAttachment[];
      mentions?: MessageMention[];
      skills?: RunSkill[];
      mcp?: RunMcpServer[];
      github?: RunGithub;
      env?: RunEnvVar[];
      identity?: RunIdentityCredential;
      memory?: RunMemory;
      cockpit?: CockpitAccess;
      model?: RunModel;
    }
  | {
      type: "run.resume";
      runId: string;
      thread: RunThreadInfo;
      continuation: unknown;
      response: unknown;
      skills?: RunSkill[];
      mcp?: RunMcpServer[];
      github?: RunGithub;
      env?: RunEnvVar[];
      identity?: RunIdentityCredential;
      memory?: RunMemory;
      cockpit?: CockpitAccess;
      model?: RunModel;
    }
  | { type: "run.cancel"; runId: string; reason: string }
  | {
      type: "bot.reply";
      replyId: string;
      bot: BotReplyInfo;
      prompt: string;
      model: RunModel;
      attachments?: RunAttachment[];
      skills?: RunSkill[];
      mcp?: RunMcpServer[];
      memory?: RunMemory;
      cockpit?: CockpitAccess;
    }
  | { type: "bot.cancel"; replyId: string; reason: string }
  | { type: "run.attach"; runId: string; after: number }
  | { type: "run.ack"; runId: string }
  | { type: "desktop.open"; viewerId: string; threadId: string }
  | { type: "desktop.close"; viewerId: string }
  | { type: "terminal.open"; viewerId: string; threadId: string; cols: number; rows: number }
  | { type: "terminal.resize"; viewerId: string; cols: number; rows: number }
  | { type: "terminal.close"; viewerId: string }
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

export type RuntimeToControlPlane =
  | { type: "hello"; version: number; runs: string[]; build?: string; canUpdate?: boolean }
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
  | { type: "bot.say"; replyId: string; text: string }
  | { type: "bot.end"; replyId: string; error?: string }
  | { type: "desktop.opened"; viewerId: string }
  | { type: "desktop.closed"; viewerId: string; reason: string }
  | { type: "terminal.opened"; viewerId: string }
  | { type: "terminal.closed"; viewerId: string; reason: string }
  | Reply;

export type MemoryCallMethod = "memory.append" | "memory.notes";

export type CockpitCallMethod = "cockpit.read";

export type ForkCallMethod = "fork.start" | "fork.status";

export type RepoCallMethod = "repo.access";

export type SkillsCallMethod = "skills.get";

export type BotCallMethod =
  | "bot.memory"
  | "bot.create"
  | "bot.update"
  | "bot.send"
  | "bot.question"
  | "bot.schedule"
  | "bot.goal"
  | "bot.skill"
  | "bot.mcp"
  | "bot.provider"
  | "bot.thread"
  | "bot.notes"
  | "bot.cockpit";

export type McpReportCallMethod = "mcp.report";

export type CallMethod =
  | MemoryCallMethod
  | CockpitCallMethod
  | ForkCallMethod
  | RepoCallMethod
  | SkillsCallMethod
  | McpReportCallMethod
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
);

export type BotThreaded = BotProjectView[] | BotThreadView[] | BotThreadDetail | BotThreadView;

export type BotSkillParams = { replyId: string; digest: string };

export type SkillArchive = { data: string };

export type MemoryNotesParams = { runId: string; command: MemoryCommand };

export type BotNotesParams = { replyId: string; command: MemoryCommand };

export type CockpitReadParams = { runId: string; command: CockpitCommand };

export type ForkStartParams = { runId: string; task: string; context: string; title?: string };

export type ForkStatusParams = { runId: string; id: string };

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

export type RuntimeCalls = {
  "bot.memory": { params: BotMemoryParams; result: unknown };
  "bot.create": { params: BotCreateParams; result: BotCreated };
  "bot.update": { params: BotUpdateParams; result: BotUpdated };
  "bot.send": { params: BotSendParams; result: BotSent };
  "bot.question": { params: BotQuestionParams; result: BotQuestioned };
  "bot.schedule": { params: BotScheduleParams; result: BotScheduled };
  "bot.goal": { params: BotGoalParams; result: BotGoaled };
  "bot.skill": { params: BotSkillParams; result: SkillArchive };
  "bot.mcp": { params: BotMcpParams; result: BotMcped };
  "bot.provider": { params: BotProviderParams; result: BotProvided };
  "bot.thread": { params: BotThreadParams; result: BotThreaded };
  "bot.notes": { params: BotNotesParams; result: string };
  "memory.notes": { params: MemoryNotesParams; result: string };
  "bot.cockpit": { params: BotCockpitParams; result: string };
  "cockpit.read": { params: CockpitReadParams; result: string };
  "fork.start": { params: ForkStartParams; result: { id: string; title: string } };
  "fork.status": { params: ForkStatusParams; result: ForkView };
  "repo.access": { params: RepoAccessParams; result: RepoAccess };
  "memory.append": { params: MemoryAppendParams; result: null };
  "skills.get": { params: SkillsGetParams; result: SkillArchive };
  "mcp.report": { params: McpReportParams; result: null };
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

export type BotThreadDetail = BotThreadView & {
  turns: BotThreadTurn[];
  earlier: number;
  question?: string;
};
