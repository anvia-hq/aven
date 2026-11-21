import type { BackendImage, BackendToolHost } from "@aven/agent-backend/types";
import type { RunEnvVar } from "@aven/protocol/types";

export type CodexUsage = {
  input_tokens: number;
  cached_input_tokens: number;
  cache_write_input_tokens?: number;
  output_tokens: number;
  reasoning_output_tokens: number;
};

export type CodexSdkItem =
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
      changes: { path: string; kind: string }[];
      status: "completed" | "failed";
    }
  | {
      id: string;
      type: "mcp_tool_call";
      server: string;
      tool: string;
      arguments: unknown;
      status: "in_progress" | "completed" | "failed";
      result?: { content?: { type?: string; text?: string }[] };
      error?: { message: string };
    }
  | { id: string; type: "web_search"; query: string }
  | { id: string; type: "todo_list"; items: { text: string; completed: boolean }[] }
  | { id: string; type: "error"; message: string };

export type CodexSdkEvent =
  | { type: "thread.started"; thread_id: string }
  | { type: "turn.started" }
  | { type: "turn.completed"; usage: CodexUsage }
  | { type: "turn.failed"; error: { message: string } }
  | { type: "item.started"; item: CodexSdkItem }
  | { type: "item.updated"; item: CodexSdkItem }
  | { type: "item.completed"; item: CodexSdkItem }
  | { type: "error"; message: string };

export type CodexQueryInput = {
  prompt: string;
  images: BackendImage[];
  sessionId?: string;
  token: string;
  cwd: string;
  codexHome: string;
  mcpUrl: string;
  mcpToken: string;
  abortController: AbortController;
  tools: BackendToolHost;
  env: readonly RunEnvVar[];
  redact(text: string): string;
  instructions?: string;
  model?: string;
  effort?: string;
};

export type CodexQuery = (
  input: CodexQueryInput,
) => AsyncIterable<CodexSdkEvent> & { close?(): void };

export type CodexClientConfig = {
  mcp_servers: {
    aven: {
      url: string;
      tool_timeout_sec: number;
      default_tools_approval_mode: string;
      bearer_token_env_var: string;
    };
  };
  features: { readonly shell_tool: false };
};

export type CodexLike = {
  startThread(options: Record<string, unknown>): {
    runStreamed(
      input: unknown,
      turn?: { signal?: AbortSignal },
    ): Promise<{ events: AsyncIterable<CodexSdkEvent> }>;
  };
  resumeThread(
    id: string,
    options: Record<string, unknown>,
  ): {
    runStreamed(
      input: unknown,
      turn?: { signal?: AbortSignal },
    ): Promise<{ events: AsyncIterable<CodexSdkEvent> }>;
  };
};

export type CodexLoader = (options: {
  apiKey?: string;
  env: Record<string, string>;
  config: CodexClientConfig;
  codexPathOverride?: string;
}) => Promise<CodexLike>;

export type CodexDeviceCode = {
  deviceAuthId: string;
  userCode: string;
  verificationUrl: string;
  intervalSeconds: number;
  expiresAt: string | null;
};

export type CodexDevicePoll = { status: "pending" } | { status: "done"; auth: string };
