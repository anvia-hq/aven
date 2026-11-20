import type { BackendPromptItem, BackendToolHost } from "@aven/agent-backend/types";
import type { RunEnvVar } from "@aven/protocol/types";

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
  prompt: AsyncIterable<BackendPromptItem>;
  sessionId?: string;
  token: string;
  cwd: string;
  configDir: string;
  binaryDir: string;
  abortController: AbortController;
  tools: BackendToolHost;
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
