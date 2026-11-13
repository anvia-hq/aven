import type { z } from "zod";
import type { AgentBackendCapabilities } from "@aven/protocol/runtime-wire";
import type {
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
import type { AgentInteractionResponse } from "@anvia/core/agent/interactions";

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

export type ClaudeQuestion = {
  name: "ask_user" | "request_secret";
  questions: QuestionPrompt[];
};

export type ClaudeToolContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };

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
  steered?(): ClaudeSteered | undefined;
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

export type ClaudeImage = { mediaType: string; data: string };

export type ClaudeUserInput = { text: string; images: ClaudeImage[] };

export type ClaudePromptItem = string | ClaudeUserInput;

export type ClaudeSteered = ClaudeUserInput;

export type ClaudeModelUsage = { contextWindow?: number };

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
      parent_tool_use_id?: string | null;
      error?: string;
      message?: { content?: unknown; usage?: ClaudeUsage };
    }
  | { type: "user"; session_id?: string; message?: { content?: unknown } }
  | { type: "system"; session_id?: string }
  | { type: "rate_limit_event"; session_id?: string; rate_limit_info?: unknown }
  | { type: "plan_limits"; session_id?: string; usage?: unknown }
  | {
      type: "result";
      session_id?: string;
      subtype?: string;
      result?: string;
      errors?: string[];
      usage?: ClaudeUsage;
      modelUsage?: Record<string, ClaudeModelUsage>;
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
  prompt: AsyncIterable<ClaudePromptItem>;
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

export type RunInput = {
  agent?: Agent<unknown>;
  compaction?: DurableAgentRegistration["compaction"];
  contextWindow?: number;
  compacting?: boolean;
  claude?: ClaudeRunContext;
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

export type ClaudeMcpTool = {
  name: string;
  description: string;
  shape: Record<string, z.ZodType>;
  handler(args: unknown): Promise<{ content: ClaudeToolContent[]; isError?: boolean }>;
};

export type ClaudeSteer = { id: string; text: string; images: ClaudeImage[] };

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
