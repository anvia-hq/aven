import type {
  AssistantContentPart,
  CompletionModel,
  CompletionRequest,
  JsonValue,
  Message,
} from "@anvia/core";
import type { SANDBOX_TOOL_NAMES } from "./sandbox-tools";
import type { SUBAGENT_TYPES } from "./subagents";
import type { MessageAttachment, MessageMention, Provider, RunEvent } from "@aven/protocol/types";

export type ModelSource = ModelConfig | { model: CompletionModel };

export type KeptAttachment = MessageAttachment & { path: string };

export type SentExtras = {
  attachments?: readonly KeptAttachment[];
  images?: ReadonlyMap<string, string>;
  mentions?: readonly MessageMention[];
  skills?: readonly SkillListing[];
};

export type McpNote = {
  servers: readonly { name: string; tools: number }[];
  failed: readonly { name: string; reason: string }[];
};

export type ModelApiKey = string | undefined;

export type ModelConfig = {
  provider: Provider;
  modelId?: string;
  apiKey?: string;
  baseUrl?: string;
  reasoningEffort?: string;
  effortLevels?: readonly string[];
  contextWindow?: number;
};

export type ReasoningControls = { options: readonly string[]; defaultValue: string | null };

export type SandboxToolName = (typeof SANDBOX_TOOL_NAMES)[number];

export type SkillListing = { name: string; description: string; path: string };

export type SubagentType = (typeof SUBAGENT_TYPES)[number];

export type ScriptStep =
  | AssistantContentPart[]
  | ((request: CompletionRequest) => AssistantContentPart[] | Promise<AssistantContentPart[]>);

export type CodexItem =
  | { id: string; type: "agent_message"; text: string }
  | { id: string; type: "reasoning"; text: string }
  | {
      id: string;
      type: "command_execution";
      command: string;
      aggregated_output: string;
      exit_code?: number;
      status: "in_progress" | "completed" | "failed";
    }
  | {
      id: string;
      type: "file_change";
      changes: { path: string; kind: "add" | "delete" | "update" }[];
      status: "completed" | "failed";
    }
  | {
      id: string;
      type: "mcp_tool_call";
      server: string;
      tool: string;
      arguments: JsonValue;
      result?: { content: { type: string; text?: string }[]; structured_content?: JsonValue };
      error?: { message: string };
      status: "in_progress" | "completed" | "failed";
    }
  | { id: string; type: "web_search"; query: string }
  | { id: string; type: "todo_list"; items: { text: string; completed: boolean }[] }
  | { id: string; type: "error"; message: string };

export type CodexEvent =
  | { type: "thread.started"; thread_id: string }
  | { type: "turn.started" }
  | {
      type: "turn.completed";
      usage: {
        input_tokens: number;
        cached_input_tokens: number;
        cache_write_input_tokens?: number;
        output_tokens: number;
        reasoning_output_tokens?: number;
      };
    }
  | { type: "turn.failed"; error: { message: string } }
  | { type: "item.started" | "item.updated" | "item.completed"; item: CodexItem }
  | { type: "error"; message: string };

export type CodexProjector = {
  readonly threadId: string | undefined;
  messages(): Message[];
  project(event: CodexEvent): RunEvent[];
};
