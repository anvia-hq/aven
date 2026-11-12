import { ClaudeRuns } from "./claude-backend";
import { claudeFakeQuery } from "./claude-fake";
import { claudeSdkQuery } from "./claude-sdk";
import { DurableRuns } from "./durable-runs";
import { CodexRuns } from "./codex-backend";
import { codexQueryForProcess } from "./codex-fake";
import type { AgentBackend, AgentBackendSet, ClaudeQuery } from "./types";

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

export function openAgentBackends(
  journalPath: string,
  keepAgents: ReadonlySet<string>,
): AgentBackendSet {
  const native = DurableRuns.open(journalPath, keepAgents);
  const codex = Promise.resolve(CodexRuns.open(journalPath, codexQueryForProcess()));
  native.catch(() => undefined);
  const claude = Promise.resolve(ClaudeRuns.open(journalPath, claudeQueryForProcess()));
  claude.catch(() => undefined);
  codex.catch(() => undefined);
  const installed = new Map<string, Promise<AgentBackend>>([
    [NATIVE, native],
    [CLAUDE, claude],
    [CODEX, codex],
  ]);
  return {
    offered: [NATIVE, CLAUDE, CODEX],
    get: (kind) => backendFor(installed, kind),
    async close() {
      const opened = await Promise.all(
        [native, claude, codex].map((backend) => backend.catch(() => undefined)),
      );
      await Promise.all(opened.map((backend) => backend?.close().catch(() => undefined)));
    },
  };
}
