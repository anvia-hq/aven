import type { RuntimeConnection } from "./hub";
import type { runnerVia } from "./ask-runner";
import type { MODES } from "./local";
import type { MemoryStore } from "@anvia/core";
import type { MemoryCaller } from "../memory/types";
import type { CockpitCaller } from "../cockpit/types";
import type { ThreadForks } from "../threads/types";
import type {
  BotCockpitParams,
  BotCreated,
  BotCreateParams,
  BotGoaled,
  BotGoalParams,
  BotMcped,
  BotMcpParams,
  BotMemoryParams,
  BotNotesParams,
  BotProvided,
  BotProviderParams,
  BotQuestioned,
  BotQuestionParams,
  BotScheduled,
  BotScheduleParams,
  BotSendParams,
  BotSent,
  BotSkillParams,
  BotThreaded,
  BotThreadParams,
  BotUpdated,
  BotUpdateParams,
  McpConnectResult,
  RepoAccess,
  RunEvent,
  RunOutcome,
  RunThreadInfo,
  RuntimeProviderKind,
} from "@aven/protocol/types";

export type Available<T> = { available: false } | ({ available: true } & T);

export type Refusal = {
  logged: string;
  message: string;
  instead?: (reason: string) => Error | undefined;
};

export type FindRunner = (scope: string, id: string) => Promise<RuntimeConnection>;

export interface RuntimeProvider {
  readonly kind: RuntimeProviderKind;
  start(runtimeId: string, offline?: string): Promise<RuntimeConnection>;
}

export type ProviderOf = (runtimeId: string) => Promise<RuntimeProviderKind | undefined>;

export type Runner = ReturnType<typeof runnerVia>;

export type RunSink = {
  event(event: RunEvent): void;
  end(outcome: RunOutcome, error?: string, continuation?: unknown): void;
  lost(error: Error): void;
};

export type BotReplySink = CallBotReply & {
  say(text: string): void;
  end(error?: string): void;
  lost(error: Error): void;
};

export type LatestRelease = { get(): Promise<string | undefined> };

export type LocalRunnerMode = (typeof MODES)[number];

export type CallRun = {
  thread: RunThreadInfo;
  appended: Set<number>;
  skills: Set<string>;
  mcp: Set<string>;
  memory?: MemoryCaller;
  cockpit?: CockpitCaller;
};

export type CallBotReply = {
  memory(params: BotMemoryParams): Promise<unknown>;
  create(params: BotCreateParams): Promise<BotCreated>;
  update(params: BotUpdateParams): Promise<BotUpdated>;
  send(params: BotSendParams): Promise<BotSent>;
  schedule(params: BotScheduleParams): Promise<BotScheduled>;
  goal(params: BotGoalParams): Promise<BotGoaled>;
  question(params: BotQuestionParams): Promise<BotQuestioned>;
  skill(params: BotSkillParams): Promise<{ data: string }>;
  mcp(params: BotMcpParams): Promise<BotMcped>;
  provider(params: BotProviderParams): Promise<BotProvided>;
  thread(params: BotThreadParams): Promise<BotThreaded>;
  notes(params: BotNotesParams): Promise<string>;
  cockpit(params: Omit<BotCockpitParams, "command"> & { command: unknown }): Promise<string>;
};

export type RuntimeCallContext = {
  forks: ThreadForks;
  findRun(runId: string): CallRun | undefined;
  findBotReply(replyId: string): CallBotReply | undefined;
  store: MemoryStore;
  repoAccess(threadId: string): Promise<RepoAccess>;
  folderOf(threadId: string): Promise<string | null>;
  skillArchive(digest: string): Promise<Uint8Array | undefined>;
  mcpReport(results: McpConnectResult[]): Promise<void>;
};

export type ViewerSink = {
  data(bytes: Uint8Array): void;
  closed(reason: string): void;
};

export type ViewerHandle = {
  write(bytes: Uint8Array): void;
  close(): void;
};

export type TerminalHandle = ViewerHandle & {
  resize(cols: number, rows: number): void;
};
