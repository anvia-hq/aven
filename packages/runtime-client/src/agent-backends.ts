import { DurableRuns } from "./durable-runs";
import { CodexRuns } from "./codex-backend";
import { codexQueryForProcess } from "./codex-fake";
import type { AgentBackend, AgentBackendSet } from "./types";

const NATIVE = "native";
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

export function openAgentBackends(
  journalPath: string,
  keepAgents: ReadonlySet<string>,
): AgentBackendSet {
  const native = DurableRuns.open(journalPath, keepAgents);
  const codex = Promise.resolve(CodexRuns.open(journalPath, codexQueryForProcess()));
  native.catch(() => undefined);
  codex.catch(() => undefined);
  const installed = new Map<string, Promise<AgentBackend>>([
    [NATIVE, native],
    [CODEX, codex],
  ]);
  return {
    offered: [NATIVE, CODEX],
    get: (kind) => backendFor(installed, kind),
    async close() {
      const opened = await Promise.all(
        [native, codex].map((backend) => backend.catch(() => undefined)),
      );
      await Promise.all(opened.map((backend) => backend?.close().catch(() => undefined)));
    },
  };
}
