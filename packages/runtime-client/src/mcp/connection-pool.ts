import type { RunMcpServer } from "@aven/protocol/types";
import type { ConnectedMcp } from "../types";

const MCP_SWEEP_MS = 60_000;

export function mcpConfigKey(configs: readonly RunMcpServer[]) {
  return JSON.stringify(
    [...configs]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(({ id, name, url, headers, allowLocal }) => [
        id,
        name,
        url,
        Object.entries(headers ?? {}).sort(([a], [b]) => a.localeCompare(b)),
        allowLocal === true,
      ]),
  );
}

export class McpConnectionPool {
  #entries = new Map<string, { key: string; connected: ConnectedMcp }>();
  #inUse: ((threadId: string) => boolean) | undefined;
  #sweeper: ReturnType<typeof setInterval> | undefined;

  constructor(options?: {
    inUse?: (threadId: string) => boolean;
    stopped?: () => boolean;
    sweepMs?: number;
  }) {
    this.#inUse = options?.inUse;

    if (this.#inUse) {
      this.#sweeper = setInterval(() => {
        if (options?.stopped?.()) {
          this.#stopSweeper();
          return;
        }

        void this.sweep("");
      }, options?.sweepMs ?? MCP_SWEEP_MS);
      this.#sweeper.unref();
    }
  }

  get(threadId: string) {
    return this.#entries.get(threadId)?.connected;
  }

  async connect(
    threadId: string,
    configs: readonly RunMcpServer[],
    open: (configs: readonly RunMcpServer[]) => Promise<ConnectedMcp>,
  ) {
    if (this.#inUse) await this.sweep(threadId);

    const key = mcpConfigKey(configs);
    const kept = this.#entries.get(threadId);

    if (kept && kept.key === key && kept.connected.results.every((result) => !result.error)) {
      return kept.connected;
    }

    await this.closeThread(threadId);
    const connected = await open(configs);
    this.#entries.set(threadId, { key, connected });
    return connected;
  }

  async sweep(exceptThreadId: string) {
    if (!this.#inUse) return;

    for (const [id, entry] of this.#entries) {
      if (id === exceptThreadId || this.#inUse(id)) continue;

      this.#entries.delete(id);
      await entry.connected.close().catch(() => undefined);
    }
  }

  async closeThread(threadId: string) {
    const kept = this.#entries.get(threadId);
    this.#entries.delete(threadId);
    await kept?.connected.close().catch(() => undefined);
  }

  async close() {
    this.#stopSweeper();
    const entries = [...this.#entries.values()];
    this.#entries.clear();
    await Promise.all(entries.map(({ connected }) => connected.close().catch(() => undefined)));
  }

  #stopSweeper() {
    if (this.#sweeper !== undefined) {
      clearInterval(this.#sweeper);
      this.#sweeper = undefined;
    }
  }
}
