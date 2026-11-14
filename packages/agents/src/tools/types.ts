import type { NewBotInput } from "./create-bot";
import type { DeleteBotInput } from "./delete-bot";
import type { McpServerInput, McpServerPatch } from "./mcp-servers";
import type { ProviderInput, ProviderPatch } from "./providers";
import type { ScheduleInput, SchedulePatch } from "./schedules";
import type { SendMessageInput } from "./send-message";
import type { SubagentType } from "../types";
import type { SubagentTask } from "./spawn-agent";
import type { ContinueThreadInput, StartThreadInput } from "./threads";
import type { SelfChanges } from "./update-self";
import type {
  BotGoalView,
  BotMcpView,
  BotProjectView,
  BotProviderView,
  BotQuestion,
  BotQuestioned,
  BotScheduleView,
  BotThreadDetail,
  BotThreadView,
  CockpitCommand,
  ComputerState,
  ForkView,
  GoalAction,
  MemoryCommand,
  ProviderKeyAsk,
  ToolArtifact,
} from "@aven/protocol/types";

export type AskQuestion = (questions: BotQuestion[]) => Promise<BotQuestioned>;

export type ComputerHost = {
  status(): Promise<ComputerState>;
  wake(): Promise<{ before: ComputerState; state: ComputerState }>;
};

export type Clock = {
  now(): number;
  sleep(ms: number, abortSignal?: AbortSignal): Promise<void>;
};

export type ApiHost = (
  params:
    | { op: "search"; query?: string | undefined }
    | {
        op: "call";
        method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
        path: string;
        body?: unknown;
        organizationId?: string | undefined;
        confirmed?: boolean | undefined;
      },
) => Promise<unknown>;

export type CockpitHost = (command: CockpitCommand) => Promise<string>;

export type CreateBot = (
  input: NewBotInput,
) => Promise<{ id: string; name: string; handle: string }>;

export type DeleteBot = (input: DeleteBotInput) => Promise<{ name: string; handle: string }>;

export type EditableFiles = {
  workdir: string;
  readTextFile(options: { path: string; abortSignal?: AbortSignal }): Promise<string>;
  writeTextFile(options: { path: string; text: string; abortSignal?: AbortSignal }): Promise<void>;
};

export type TakenChanges = { empty: true } | { empty: false; patchPath: string; files: string[] };

export type ForkHost = {
  start(input: {
    task: string;
    context: string;
    title?: string;
  }): Promise<{ id: string; title: string }>;
  status(id: string): Promise<ForkView>;
  stop(id: string): Promise<ForkView>;
  take(id: string): Promise<TakenChanges>;
};

export type FetchedBranch = { branch: string; commit: string; previous: string | null };

export type FetchRemote = (
  branch: string | undefined,
  abortSignal?: AbortSignal,
) => Promise<FetchedBranch>;

export type GoalHost = {
  get(): Promise<BotGoalView | null>;
  start(input: { objective: string; checks: string[]; maxRounds?: number }): Promise<BotGoalView>;
  update(action: GoalAction, reason?: string): Promise<BotGoalView | null>;
  check?(checks: readonly string[], signal?: AbortSignal): Promise<string[]>;
};

export type McpServersHost = {
  list(): Promise<BotMcpView[]>;
  add(input: McpServerInput): Promise<BotMcpView>;
  update(id: string, patch: McpServerPatch): Promise<BotMcpView>;
  remove(id: string): Promise<void>;
};

export type MemoryHost = (command: MemoryCommand) => Promise<string>;

export type ProvidersHost = {
  list(): Promise<BotProviderView[]>;
  add(input: ProviderInput): Promise<BotProviderView>;
  update(id: string, patch: ProviderPatch): Promise<BotProviderView>;
  remove(id: string): Promise<void>;
  models(id: string): Promise<string[]>;
  askKey?(id: string): Promise<ProviderKeyAsk>;
};

export type ScheduleHost = {
  list(): Promise<BotScheduleView[]>;
  create(input: ScheduleInput): Promise<BotScheduleView>;
  update(id: string, patch: SchedulePatch): Promise<BotScheduleView>;
  remove(id: string): Promise<void>;
};

export type SendMessage = (
  message: SendMessageInput,
  context: { abortSignal?: AbortSignal },
) => Promise<string | SentWithFiles>;

export type SentWithFiles = {
  sent: string;
  artifacts: ToolArtifact[];
  failed: { path: string; error: string }[];
};

export type ReactToMessage = (message: { messageId: string; emoji: string }) => Promise<string>;

export type ImageFiles = {
  readFile(options: { path: string; abortSignal?: AbortSignal }): Promise<Uint8Array>;
};

export type ShownArtifacts = {
  artifacts: ToolArtifact[];
  paths: string[];
  failed: { path: string; error: string }[];
};

export type RunSubagent = (
  task: SubagentTask,
  context: {
    index: number;
    abortSignal?: AbortSignal;
  },
) => Promise<string>;

export type SubagentResult = {
  description: string;
  type: SubagentType;
} & ({ status: "done"; output: string } | { status: "error"; error: string });

export type ThreadsHost = {
  projects(): Promise<BotProjectView[]>;
  list(filter: { projectId?: string; archived?: boolean }): Promise<BotThreadView[]>;
  get(id: string): Promise<BotThreadDetail>;
  start(input: StartThreadInput): Promise<BotThreadView>;
  continue(id: string, input: ContinueThreadInput): Promise<BotThreadView>;
  archive(id: string, archived: boolean): Promise<BotThreadView>;
  stop(id: string): Promise<BotThreadView>;
};

export type UpdateSelf = (changes: SelfChanges) => Promise<{ name: string; description: string }>;
