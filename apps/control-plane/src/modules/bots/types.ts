import type { createBotChats } from "./chats";
import type { UpdateBotBody } from "./schema";
import type { AgentMemoryOptions } from "@anvia/core";
import type { createBotAgent } from "@aven/agents/bot-agent";
import type { GoalInput } from "../goals/types";
import type { MemoryCaller, MemoryOwner, MemoryPlace } from "../memory/types";
import type { ScheduleInput, SchedulePatch } from "../schedules/types";
import type { ModelConfig } from "@aven/agents/types";
import type { BotProviders, BotRunChoice } from "../providers/types";
import type {
  AskQuestion,
  CreateBot,
  DeleteBot,
  McpServersHost,
  MemoryHost,
  ProjectFilesHost,
  ProvidersHost,
  ReactToMessage,
  ScheduleHost,
  SendMessage,
  ThreadsHost,
  UpdateSelf,
} from "@aven/agents/tools/types";
import type { BotMcp } from "../mcp/types";
import type { BotThreads } from "../threads/types";
import type {
  BotApiRequest,
  BotApiResult,
  ToolArtifact,
  Bot,
  BotCreateParams,
  BotProjectEntry,
  BotReplyProject,
  BotThreadView,
  CockpitTask,
  InboxItem,
  BotGoalView,
  BotQuestion,
  BotReacted,
  BotScheduleView,
  BotSent,
  GoalAction,
  MemoryCommand,
  MemoryFolder,
  RunAttachment,
  RunSkill,
} from "@aven/protocol/types";

export type BotLetter = {
  userId: string;
  from: Bot;
  hops: number;
  handle: string;
  text: string;
  relaysPersonsWord: boolean;
};

export type BotChats = ReturnType<typeof createBotChats>;

import type { BotApiAsk } from "../bot-api/service";

export type BotReplyBots = {
  list(userId: string): Promise<Bot[]>;
  create(userId: string, bot: NewBot): Promise<Bot>;
  update(userId: string, id: string, changes: UpdateBotBody): Promise<Bot | null>;
  remove(userId: string, id: string): Promise<void>;
  deliver(letter: BotLetter): Promise<BotSent>;
  greet(userId: string, botId: string, hops: number): Promise<void>;
  timezone(userId: string): Promise<string>;
  schedules: {
    list(userId: string): Promise<BotScheduleView[]>;
    create(userId: string, selfId: string, input: ScheduleInput): Promise<BotScheduleView>;
    update(userId: string, id: string, patch: SchedulePatch): Promise<BotScheduleView>;
    remove(userId: string, id: string): Promise<void>;
  };
  api: { answer(ask: BotApiAsk): Promise<BotApiResult> };
};

export type BotKeeper = BotReplyBots & {
  goals: {
    get(botId: string): Promise<BotGoalView | null>;
    start(userId: string, botId: string, input: GoalInput): Promise<BotGoalView>;
    update(botId: string, action: GoalAction, reason?: string): Promise<BotGoalView | null>;
  };
  usableRuntime(userId: string, runtimeId: string): Promise<void>;
};

export type BotMemoryNotes = {
  keepDigest(userId: string, botId: string): Promise<void>;
  folders(owner: MemoryOwner): Promise<MemoryFolder[]>;
  run(caller: MemoryCaller, command: MemoryCommand): Promise<string>;
};

export type BotSkills = {
  forRun(userId: string): Promise<RunSkill[]>;
  archive(digest: string): Promise<Uint8Array | undefined>;
};

export type BotReplyInput = {
  bot: Bot;
  userId: string;
  choice: BotRunChoice;
  prompt: string;
  attachments?: RunAttachment[];
  onPersonsWord: boolean;
  hops: number;
  aboutThread?: string;
  say(text: string, quote?: string, files?: ToolArtifact[]): void;
  ask(questions: BotQuestion[]): void;
  react(messageId: string, emoji: string): BotReacted;
  activity?(label: string | null): void;
  signal: AbortSignal;
};

export type BotReplier = {
  ready(choice: BotRunChoice, bot: Pick<Bot, "runtimeId" | "hasComputer">): void;
  answer(input: BotReplyInput): Promise<void>;
};

export type BotSaid = (botId: string, askedQuestion: boolean) => void;

export type BotSettled = (reply: {
  userId: string;
  botId: string;
  prompt: string;
  ok: boolean;
}) => Promise<void>;

export type BotDelivery = {
  bot: Bot;
  userId: string;
  from: Pick<Bot, "id" | "name" | "handle">;
  text: string;
  hops: number;
  relaysPersonsWord: boolean;
  choice: BotRunChoice;
};

export type NewBot = Omit<BotCreateParams, "replyId">;

export type BotAgent = Pick<ReturnType<typeof createBotAgent>, "generate">;

export type CreateBotAgent = (input: {
  bot: Bot;
  model: ModelConfig;
  send: SendMessage;
  react: ReactToMessage;
  askQuestion: AskQuestion;
  memory: AgentMemoryOptions;
}) => BotAgent;

export type CurrentWorkInput = {
  now: Date;
  timezone: string;
  threads: readonly BotThreadView[];
  tasks: readonly CockpitTask[];
  inbox: readonly InboxItem[];
};

export type WorldProject = {
  id: string;
  repository: string;
  updatedAt: Date;
  github?: { installationId: string; repo: string };
};

export type BriefSource = Pick<WorldProject, "id" | "github">;

export type WorldGithub = {
  file(
    installationId: string,
    repo: string,
    path: string,
    maxChars: number,
  ): Promise<ProjectFile | null>;
  folder(installationId: string, repo: string, path: string): Promise<BotProjectEntry[] | null>;
  readme(installationId: string, repo: string): Promise<{ text: string } | null>;
};

export type WorldSource = {
  timezone(userId: string): Promise<string>;
  projects(userId: string): Promise<WorldProject[]>;
  tasks(userId: string): Promise<CockpitTask[]>;
  inbox(userId: string): Promise<InboxItem[]>;
  github: WorldGithub;
};

export type ProjectFile = { path: string; text: string; truncated: boolean };

export type BotWorldView = { context: string; projects: BotReplyProject[] };

export type BotWorldKeeper = {
  forReply(userId: string): Promise<BotWorldView>;
  folder(userId: string, projectId: string, path?: string): Promise<BotProjectEntry[]>;
  file(userId: string, projectId: string, path: string): Promise<ProjectFile>;
};

export type ReplyHostsInput = {
  bot: Pick<Bot, "id" | "handle" | "isMain">;
  userId: string;
  prompt: string;
  hops: number;
  onPersonsWord: boolean;
  aboutThread?: string | undefined;
  memoryOwner: MemoryOwner;
  ask(questions: readonly BotQuestion[]): void;
  bots: BotReplyBots;
  mcp: BotMcp;
  providers: BotProviders;
  threads: BotThreads;
  notes: BotMemoryNotes;
  world: BotWorldKeeper;
};

export type ReplyHosts = {
  createBot: CreateBot;
  deleteBot: DeleteBot;
  updateSelf: UpdateSelf;
  schedules: ScheduleHost;
  mcpServers: McpServersHost;
  providers: ProvidersHost;
  threads: ThreadsHost;
  api: (params: BotApiRequest) => Promise<BotApiResult>;
  notes: MemoryHost;
  cockpit: (command: unknown) => Promise<string>;
  projectFiles: ProjectFilesHost;
  asked(): boolean;
  takeAsked(): void;
};

export type ActivityDigestInput = {
  now: Date;
  threads: readonly BotThreadView[];
  tasks: readonly CockpitTask[];
};

export type ActivityDigestStore = {
  writtenAt(place: MemoryPlace, name: string): Promise<Date | undefined>;
  refresh(
    place: MemoryPlace,
    name: string,
    body: string,
    unlessWrittenSince: Date,
  ): Promise<boolean>;
};
