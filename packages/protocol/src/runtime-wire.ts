import type { ForkView } from "./forks";
import type { BotQuestion } from "./bots";
import type { BotGoalView, GoalAction } from "./goals";
import type { BotMcpView, McpTarget } from "./mcp";
import type { CockpitAccess, CockpitCommand } from "./cockpit";
import type { MemoryCommand, RunMemory } from "./memory";
import type { BotProviderView, ProviderKeyAsk } from "./providers";
import type { BotScheduleView } from "./schedules";
import type { BotProjectView, BotThreadDetail, BotThreadView } from "./threads";
import type { MessageAttachment, MessageMention, RunEvent } from "./events";

export type RunThreadInfo = {
  id: string;
  organizationId: string;
  forkOf?: string;
};

export const PROVIDERS = [
  "openai",
  "anthropic",
  "gemini",
  "bedrock",
  "vertex",
  "azure",
  "openai-compatible",
] as const;
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

type DiffCallMethod = "diff.get";

export const DIFF_SCOPES = ["turn", "all", "unshipped"] as const;
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

type ArtifactsCallMethod = "artifacts.read";

export type ArtifactContent = { mediaType: string; data: string };

export const ARTIFACT_MEDIA_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "video/mp4",
  "video/webm",
] as const;

export const ARTIFACT_EXTENSIONS: Record<(typeof ARTIFACT_MEDIA_TYPES)[number], string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/webm": "webm",
};

export const ARTIFACT_NAME =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|gif|webp|mp4|webm)$/;

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

type RunCallMethod = "run.steer";

export type SteerResult =
  | { status: "queued" }
  | { status: "closed" }
  | { status: "refused"; reason: string };

type SandboxCallMethod = "sandbox.release";

type RunnerSelfCallMethod = "runner.update";

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

export const FILE_SEARCH_LIMIT = 50;

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

export const SKILL_DIGEST = /^[0-9a-f]{64}$/;

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

type RepoAccessParams = { runId: string };

type SkillsGetParams = { runId: string; digest: string };

export type McpConnectResult = { id: string; error?: string };

type McpReportParams = { runId: string; results: McpConnectResult[] };

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

type ThreadModelChoice = { providerId?: string; modelId?: string; reasoningEffort?: string };

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

type SkillArchive = { data: string };

export type MemoryNotesParams = { runId: string; command: MemoryCommand };

export type BotNotesParams = { replyId: string; command: MemoryCommand };

export type CockpitReadParams = { runId: string; command: CockpitCommand };

export type ForkStartParams = { runId: string; task: string; context: string; title?: string };

export type ForkStatusParams = { runId: string; id: string };

export type BotCockpitParams = { replyId: string; command: CockpitCommand };

type MemoryAppendParams = {
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

export const CloseCode = {
  UnsupportedVersion: 4000,
  Replaced: 4001,
  Revoked: 4002,
} as const;

export const WIRE_VERSION = 49;
