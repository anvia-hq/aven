import type { z } from "zod";
import type {
  AgentBackendCapabilities,
  AgentBackendKind,
  RunEnvVar,
  RunEvent,
  QuestionPrompt,
  RunWebSearch,
  ToolArtifact,
} from "@aven/protocol/types";
import type { RunSubagent } from "@aven/agents/tools/types";
import type { Agent, AgentOutcome, AgentPrompt, AnyTool, Message } from "@anvia/core";
import type { DurableAgentRegistration } from "@anvia/durable";
import type { GoalRequest } from "@aven/agents/tools/define-goal";
import type { MachineProvider } from "@aven/agents/types";
import type { AgentInteractionResponse } from "@anvia/core/agent/interactions";

export type DurableEnd =
  | { type: "response"; messages: AgentOutcome<unknown>["messages"] }
  | { type: "interaction"; continuation: unknown; messages: AgentOutcome<unknown>["messages"] }
  | { type: "error"; error: string };

export type Gate = {
  promise: Promise<DurableEnd>;
  resolve(end: DurableEnd): void;
};

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

export type Emit = (event: RunEvent, source?: Source) => void;

export type BackendQuestion = {
  name: "ask_user" | "request_secret";
  questions: QuestionPrompt[];
};

export type BackendToolContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };

export type BackendImage = { mediaType: string; data: string };

export type BackendUserInput = { text: string; images: BackendImage[] };

export type BackendPromptItem = string | BackendUserInput;

export type BackendSteered = BackendUserInput;

export type BackendSteer = { id: string; text: string; images: BackendImage[] };

export type BackendToolHost = {
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
  onPark?(question: BackendQuestion): Promise<string>;
  runSubagent?: RunSubagent;
  shown?(artifacts: ToolArtifact[]): void;
  steered?(): BackendSteered | undefined;
};

export type HostedRunContext = {
  token?: string;
  workspace(): Promise<string>;
  tools: BackendToolHost;
  renewed?(token: string, previous: string): void;
  redact(text: string): string;
  env: readonly RunEnvVar[];
  instructions?: string;
  machine?: MachineProvider;
  model?: string;
  effort?: string;
  compact?: boolean;
  questions?: boolean;
  children?: boolean;
};

export type BackendMcpTool = {
  name: string;
  description: string;
  shape: Record<string, z.ZodType>;
  inputSchema?: Record<string, unknown>;
  handler(args: unknown): Promise<{ content: BackendToolContent[]; isError?: boolean }>;
};

export type AvenToolResult = {
  text: string;
  isError: boolean;
};

export type BackendSessionPrefix = "claude" | "codex";

export type ParkedQuestion = {
  threadId: string;
  agentId: string;
  runId: string;
  sessionId: string;
  toolCallId: string;
  toolName: string;
  questions: QuestionPrompt[];
};

export type TurnRecorderOptions = {
  provider: string;
  modelId: string;
  redact?: (text: string) => string;
};

export type RunInput = {
  agent?: Agent<unknown>;
  compaction?: DurableAgentRegistration["compaction"];
  contextWindow?: number;
  compacting?: boolean;
  claude?: HostedRunContext;
  codex?: HostedRunContext;
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

export type CommandResult = {
  command: string;
  exitCode: number | null;
  output: string;
};

export type AgentBackendSet = {
  readonly offered: readonly AgentBackendKind[];
  get(kind: string | undefined): Promise<AgentBackend>;
  close(): Promise<void>;
};

export type Source = { id: string; sequence: number };
