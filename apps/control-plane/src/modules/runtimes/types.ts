import type { CloudLifecycle } from "../cloud-lifecycle/types";
import type { RuntimeConnection } from "./connection";
import type { runnerVia } from "./ask-runner";
import type { MODES } from "./local";
import type { MemoryStore } from "@anvia/core";
import type { MemoryCaller } from "../memory/types";
import type { CockpitCaller } from "../cockpit/types";
import type { ProcessEnds, ThreadForks } from "../threads/types";
import type { MachineProcessWatch } from "./machine-process-watch";
import type {
  ToolArtifact,
  BotCockpitParams,
  BotCreated,
  BotCreateParams,
  BotDeleted,
  BotDeleteParams,
  BotGoaled,
  BotGoalParams,
  BotMcped,
  BotMcpParams,
  BotMemoryParams,
  BotNotesParams,
  BotProjected,
  BotProjectParams,
  BotProvided,
  BotProviderParams,
  BotQuestioned,
  BotQuestionParams,
  BotReacted,
  BotReactParams,
  BotScheduled,
  BotScheduleParams,
  BotSendParams,
  BotSent,
  BotSkillParams,
  BotThreaded,
  BotApiParams,
  BotApiResult,
  BotThreadParams,
  BotUpdated,
  BotUpdateParams,
  McpConnectResult,
  RepoAccess,
  RunEvent,
  RunOutcome,
  RunSecrets,
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

export type RunnerPlace = { runtimeId: string; threadId?: string };

export type ThreadPlace = Required<RunnerPlace>;

export interface RuntimeProvider {
  readonly kind: RuntimeProviderKind;
  start(place: RunnerPlace, offline?: string): Promise<RuntimeConnection>;
  release(place: ThreadPlace, runner: RuntimeConnection | undefined): Promise<void>;
}

export type Runner = ReturnType<typeof runnerVia>;

export type RunSink = {
  event(event: RunEvent): void;
  end(outcome: RunOutcome, error?: string, continuation?: unknown): void;
  lost(error: Error): void;
};

export type BotReplySink = CallBotReply & {
  say(text: string, quote?: string, files?: ToolArtifact[]): void;
  activity(label: string | null): void;
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
  botId?: string;
  machine?: string;
  memory(params: BotMemoryParams): Promise<unknown>;
  create(params: BotCreateParams): Promise<BotCreated>;
  delete(params: BotDeleteParams): Promise<BotDeleted>;
  update(params: BotUpdateParams): Promise<BotUpdated>;
  send(params: BotSendParams): Promise<BotSent>;
  react(params: BotReactParams): Promise<BotReacted>;
  schedule(params: BotScheduleParams): Promise<BotScheduled>;
  goal(params: BotGoalParams): Promise<BotGoaled>;
  question(params: BotQuestionParams): Promise<BotQuestioned>;
  skill(params: BotSkillParams): Promise<{ data: string }>;
  mcp(params: BotMcpParams): Promise<BotMcped>;
  provider(params: BotProviderParams): Promise<BotProvided>;
  thread(params: BotThreadParams): Promise<BotThreaded>;
  api(params: BotApiParams): Promise<BotApiResult>;
  project(params: BotProjectParams): Promise<BotProjected>;
  notes(params: BotNotesParams): Promise<string>;
  cockpit(params: Omit<BotCockpitParams, "command"> & { command: unknown }): Promise<string>;
};

export type MachineRelay = {
  reach(place: ThreadPlace): Promise<Pick<RuntimeConnection, "call">>;
};

export type RuntimeCallContext = {
  runtimeId: string;
  forks: ThreadForks;
  machines: MachineRelay;
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

export type CloudSandboxCursor = {
  limit?: number;
  after?: string;
};

export type ComputerRuntime = {
  id: string;
  organizationId: string | null;
  ownerId: string | null;
  parentRuntimeId: string | null;
  provider: string;
};

export type ComputerStart = {
  runtimeId: string;
  organizationId: string | null;
  userId: string | null;
};

import type { SpendVerdict } from "@aven/sandbox/types";

export type AdmissionOptions = {
  settings: () => Promise<CloudLifecycle>;
  running: (organizationId: string, exceptRuntimeId: string) => Promise<number>;
  spend?: () => Promise<SpendVerdict>;
  extra?: (start: ComputerStart) => Promise<void>;
  hidePlatformSettings?: () => boolean;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  pollMs?: number;
  maxWaitMs?: number;
};

export type TrackedRun = {
  thread: RunThreadInfo;
  sink: RunSink;
  lastSeq: number;
  appended: Set<number>;
  skills: Set<string>;
  mcp: Set<string>;
  memory?: MemoryCaller;
  cockpit?: CockpitCaller;
  secrets?: RunSecrets;
  cancel?: string;
};

export type RuntimeHelloInfo = {
  host: boolean;
  dirs: string[];
};

export type RuntimeHubHost = {
  readonly store: MemoryStore;
  readonly repoAccess: (threadId: string) => Promise<RepoAccess>;
  readonly folderOf: (threadId: string) => Promise<string | null>;
  readonly skillArchive: (digest: string) => Promise<Uint8Array | undefined>;
  readonly mcpReport: (results: McpConnectResult[]) => Promise<void>;
  readonly machineWatches: MachineProcessWatch;
  forks: ThreadForks;
  processEnds: ProcessEnds;
  machines: MachineRelay;
  onHello(runtimeId: string, info: RuntimeHelloInfo): void;
  reclaim(connection: RuntimeConnection, reported: string[]): void;
  runsOnMachine(machineId: string, threadId: string): boolean | undefined;
  hold(runtimeId: string, runs: [string, TrackedRun][]): void;
  detach(connection: RuntimeConnection): void;
};
