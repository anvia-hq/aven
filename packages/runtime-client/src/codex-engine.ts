import { Codex } from "@openai/codex-sdk";
import type { CodexOptions } from "@openai/codex-sdk";

import { createCodexProjector, CODEX_AVEN_SERVER } from "@aven/agents/codex-projection";
import type { CodexEvent } from "@aven/agents/types";
import type { RunEvent } from "@aven/protocol/types";
import type { CodexTurn, CodexTurnEnd } from "./types";

export const CODEX_MCP_TOKEN_VAR = "AVEN_MCP_TOKEN";

const SHELL_FEATURES = ["shell_tool", "unified_exec"] as const;

const KEPT_ENV = ["PATH", "HOME", "CODEX_HOME", "LANG", "LC_ALL", "TMPDIR", "USER"] as const;

export function codexEnvironment(source: Record<string, string | undefined>, token?: string) {
  const env: Record<string, string> = {};
  for (const name of KEPT_ENV) {
    const value = source[name];
    if (value !== undefined) env[name] = value;
  }
  if (token) env[CODEX_MCP_TOKEN_VAR] = token;
  return env;
}

export function codexConfig(mcpUrl?: string) {
  const config: NonNullable<CodexOptions["config"]> = {
    features: Object.fromEntries(SHELL_FEATURES.map((name) => [name, false])),
  };
  if (mcpUrl) {
    config.mcp_servers = {
      [CODEX_AVEN_SERVER]: { url: mcpUrl, bearer_token_env_var: CODEX_MCP_TOKEN_VAR },
    };
  }
  return config;
}

export async function runCodexTurn(
  turn: CodexTurn,
  emit: (event: RunEvent) => void,
): Promise<CodexTurnEnd> {
  const codex = new Codex({
    codexPathOverride: turn.codexPath,
    env: codexEnvironment(turn.env, turn.mcp?.token),
    config: codexConfig(turn.mcp?.url),
  });
  const options = {
    model: turn.model,
    modelReasoningEffort: turn.effort,
    workingDirectory: turn.workingDirectory,
    sandboxMode: "read-only" as const,
    approvalPolicy: "never" as const,
    skipGitRepoCheck: true,
    networkAccessEnabled: false,
    webSearchMode: "disabled" as const,
  };
  const thread = turn.threadId
    ? codex.resumeThread(turn.threadId, options)
    : codex.startThread(options);
  const projector = createCodexProjector();
  let failure: string | undefined;
  try {
    const { events } = await thread.runStreamed(turn.input, { signal: turn.signal });
    for await (const event of events) {
      for (const projected of projector.project(event as CodexEvent)) {
        if (projected.type === "error") failure ??= projected.message;
        emit(projected);
      }
    }
  } catch (error) {
    if (turn.signal?.aborted) {
      return { threadId: projector.threadId ?? turn.threadId, ended: "cancelled" };
    }
    failure ??= error instanceof Error ? error.message : String(error);
    emit({ type: "error", message: failure });
  }
  return {
    threadId: projector.threadId ?? thread.id ?? turn.threadId,
    ended: failure === undefined ? "done" : "error",
    error: failure,
  };
}
