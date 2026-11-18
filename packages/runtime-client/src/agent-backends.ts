import { ClaudeRuns } from "@aven/claude/claude-backend";
import { claudeFakeQuery } from "@aven/claude/claude-fake";
import { claudeSdkQuery } from "@aven/claude/claude-sdk";
import { CodexRuns } from "@aven/codex/codex-backend";
import { codexFakeQuery } from "@aven/codex/codex-fake";
import { codexSdkQuery } from "@aven/codex/codex-sdk";
import { DurableRuns } from "./durable-runs";
import type {
  AgentBackend,
  AgentBackendSet,
  ClaudeQuery,
  CodexQuery,
} from "@aven/agent-backend/types";

const NATIVE = "native";
const CLAUDE = "claude";
const CODEX = "codex";

const BACKEND_NAME = /^[a-z][a-z0-9-]{0,39}$/;

export function backendFor(
  installed: ReadonlyMap<string, Promise<AgentBackend>>,
  asked: string | undefined,
): Promise<AgentBackend> {
  const name = asked ?? NATIVE;
  const backend = installed.get(name);

  if (backend) return backend;

  const label = BACKEND_NAME.test(name) ? `the ${name} agent backend` : "that agent backend";
  return Promise.reject(new Error(`This runner does not drive ${label}`));
}

export function claudeQueryForProcess(
  env: Record<string, string | undefined> = process.env,
): ClaudeQuery {
  return env.AVEN_CLAUDE_FAKE === "1" ? claudeFakeQuery : claudeSdkQuery;
}

export function codexQueryForProcess(
  env: Record<string, string | undefined> = process.env,
): CodexQuery {
  return env.AVEN_CODEX_FAKE === "1" ? codexFakeQuery : codexSdkQuery;
}

export function openAgentBackends(
  journalPath: string,
  keepAgents: ReadonlySet<string>,
): AgentBackendSet {
  const openNative = () => {
    const opening = DurableRuns.open(journalPath, keepAgents);
    opening.catch((error) =>
      console.error(
        `The native agent backend could not open its journal: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
    return opening;
  };
  let native = openNative();
  const nativeBackend = async () => {
    const attempt = native;

    try {
      return await attempt;
    } catch {
      if (native === attempt) native = openNative();

      return native;
    }
  };
  const claude = Promise.resolve(ClaudeRuns.open(journalPath, claudeQueryForProcess()));
  const codex = Promise.resolve(CodexRuns.open(journalPath, codexQueryForProcess()));
  const installed = new Map<string, Promise<AgentBackend>>([
    [CLAUDE, claude],
    [CODEX, codex],
  ]);
  return {
    offered: [NATIVE, CLAUDE, CODEX],
    get: (kind) => ((kind ?? NATIVE) === NATIVE ? nativeBackend() : backendFor(installed, kind)),
    async close() {
      const opened = await Promise.all([
        native.catch(() => undefined),
        claude.catch(() => undefined),
        codex.catch(() => undefined),
      ]);
      await Promise.all(opened.map((backend) => backend?.close().catch(() => undefined)));
    },
  };
}
