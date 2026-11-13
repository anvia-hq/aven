import type { AssistantContentPart, CompletionModel, CompletionRequest } from "@anvia/core";
import type { SANDBOX_TOOL_NAMES } from "./sandbox-tools";
import type { SUBAGENT_TYPES } from "./subagents";
import type { MessageAttachment, MessageMention, Provider } from "@aven/protocol/types";

export type ModelSource = ModelConfig | { model: CompletionModel };

export type KeptAttachment = MessageAttachment & { path: string };

export type SandboxPaths = {
  workspace: string;
  uploads: string;
  skills: string;
};

export type SentExtras = {
  paths?: SandboxPaths;
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

export type SentFile = { path: string; title?: string | undefined };

export type BotFiles = {
  readFile(options: { path: string; abortSignal?: AbortSignal | undefined }): Promise<Uint8Array>;
  save(bytes: Uint8Array, mediaType: string): Promise<string>;
};
