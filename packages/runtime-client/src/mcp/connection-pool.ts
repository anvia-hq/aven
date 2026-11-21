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
  #connecting = new Map<string, { key: string; token: symbol; promise: Promise<ConnectedMcp> }>();
  #inUse: ((threadId: string) => boolean) | undefined;
  #sweeper: ReturnType<typeof setInterval> | undefined;
  #closed = false;

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
    for (;;) {
      const kept = this.#entries.get(threadId);

      if (kept && kept.key === key && kept.connected.results.every((result) => !result.error)) {
        return kept.connected;
      }

      const pending = this.#connecting.get(threadId);

      if (!pending) break;

      if (pending.key === key) return pending.promise;

      await pending.promise.catch(() => undefined);
    }

    const token = Symbol();
    const opening = (async () => {
      await this.closeThread(threadId);
      const connected = await open(configs);

      if (this.#closed || this.#connecting.get(threadId)?.token !== token) {
        await connected.close().catch(() => undefined);
        return connected;
      }

      this.#entries.set(threadId, { key, connected });
      return connected;
    })().finally(() => {
      if (this.#connecting.get(threadId)?.token === token) {
        this.#connecting.delete(threadId);
      }
    });

    this.#connecting.set(threadId, { key, token, promise: opening });
    return opening;
  }

  async sweep(exceptThreadId: string) {
    if (!this.#inUse) return;

    for (const [id, entry] of this.#entries) {
      if (id === exceptThreadId || this.#inUse(id) || this.#connecting.has(id)) continue;

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
    this.#closed = true;
    this.#stopSweeper();
    const entries = [...this.#entries.values()];
    this.#entries.clear();
    const inflight = [...this.#connecting.values()];
    this.#connecting.clear();
    await Promise.all([
      ...entries.map(({ connected }) => connected.close().catch(() => undefined)),
      ...inflight.map(({ promise }) =>
        promise
          .then((connected) => connected.close().catch(() => undefined))
          .catch(() => undefined),
      ),
    ]);
  }

  #stopSweeper() {
    if (this.#sweeper !== undefined) {
      clearInterval(this.#sweeper);
      this.#sweeper = undefined;
    }
  }
}
