import { DurableRuns } from "./durable-runs";
import type { AgentBackend, AgentBackendSet } from "./types";

const NATIVE = "native";

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
  native.catch(() => undefined);
  const installed = new Map<string, Promise<AgentBackend>>([[NATIVE, native]]);
  return {
    offered: [NATIVE],
    get: (kind) => backendFor(installed, kind),
    async close() {
      const opened = await native.catch(() => undefined);
      await opened?.close().catch(() => undefined);
    },
  };
}
