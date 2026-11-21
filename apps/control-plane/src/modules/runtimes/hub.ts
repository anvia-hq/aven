import type { MemoryStore } from "@anvia/core";
import { CloseCode } from "@aven/protocol/runtime-wire";
import type { McpConnectResult, RepoAccess, RunDrainReason } from "@aven/protocol/types";

import type { ProcessEnds, ThreadForks } from "../threads/types";
import {
  BackendUnavailableError,
  RUNTIME_DISCONNECTED,
  RuntimeConnection,
  RuntimeOfflineError,
} from "./connection";
import { MachineProcessWatch } from "./machine-process-watch";
import { LOCAL_RUNTIME_ID, runtimesService } from "./service";
import type {
  MachineRelay,
  RuntimeHelloInfo,
  RuntimeHubHost,
  TrackedRun,
  ViewerHandle,
  ViewerSink,
} from "./types";

export { BackendUnavailableError, RuntimeConnection, RuntimeOfflineError };

export const DEFAULT_GRACE_MS = 60_000;
const CONTROL_PLANE_RESTARTED = "The control plane restarted";

function persistHello(runtimeId: string, { host, dirs }: RuntimeHelloInfo) {
  void runtimesService.touch(runtimeId);
  void runtimesService.setHost(runtimeId, host);
  void runtimesService.setDirectories(runtimeId, dirs);
}

export class RuntimeHub implements RuntimeHubHost {
  #connections = new Map<string, RuntimeConnection>();
  #held = new Map<string, { runs: Map<string, TrackedRun>; timer: Timer }>();

  constructor(
    readonly store: MemoryStore,
    readonly repoAccess: (threadId: string) => Promise<RepoAccess> = () =>
      Promise.reject(new Error("Repository access is not available")),
    private graceMs = DEFAULT_GRACE_MS,
    readonly skillArchive: (digest: string) => Promise<Uint8Array | undefined> = async () =>
      undefined,
    readonly mcpReport: (results: McpConnectResult[]) => Promise<void> = async () => undefined,
    readonly folderOf: (threadId: string) => Promise<string | null> = async () => null,
    readonly onHello: (runtimeId: string, info: RuntimeHelloInfo) => void = persistHello,
  ) {}

  forks: ThreadForks = {
    start: () => Promise.reject(new Error("Forks are not available")),
    status: () => Promise.reject(new Error("Forks are not available")),
    ended: async () => undefined,
  };

  processEnds: ProcessEnds = { ended: async () => undefined };

  readonly machineWatches = new MachineProcessWatch((runtimeId) => this.get(runtimeId));

  machines: MachineRelay = {
    reach: () => Promise.reject(new Error("Machines are not available")),
  };

  attach(
    runtimeId: string,
    send: (message: string | Uint8Array) => void,
    closeSocket: (code?: number, reason?: string) => void,
  ) {
    this.#connections.get(runtimeId)?.close(CloseCode.Replaced, "Replaced by a newer connection");
    const connection = new RuntimeConnection(runtimeId, send, closeSocket, this);
    this.#connections.set(runtimeId, connection);
    return connection;
  }

  hold(runtimeId: string, runs: [string, TrackedRun][]) {
    const held = this.#held.get(runtimeId);
    clearTimeout(held?.timer);
    const all = held?.runs ?? new Map<string, TrackedRun>();
    for (const [runId, run] of runs) all.set(runId, run);
    const timer = setTimeout(() => this.#giveUp(runtimeId), this.graceMs);
    timer.unref();
    this.#held.set(runtimeId, { runs: all, timer });
  }

  reclaim(connection: RuntimeConnection, reported: string[]) {
    const held = this.#held.get(connection.runtimeId);
    this.#held.delete(connection.runtimeId);
    clearTimeout(held?.timer);
    const runs = held?.runs ?? new Map<string, TrackedRun>();
    for (const runId of reported) {
      const run = runs.get(runId);

      if (run) {
        runs.delete(runId);
        connection.adopt(runId, run);
      } else {
        connection.post({
          type: "run.cancel",
          runId,
          reason: "The control plane no longer follows this run",
        });
      }
    }
    for (const run of runs.values()) {
      void this.machineWatches.ended(run.thread.machine, run.thread.id, "lost");
      run.sink.lost(new Error("The runtime restarted"));
    }
  }

  runsOnMachine(machineId: string, threadId: string) {
    const agents = this.#connections.get(LOCAL_RUNTIME_ID);

    if (!agents) return undefined;

    if (agents.hasRunOnMachine(machineId, threadId)) return true;

    const held = this.#held.get(LOCAL_RUNTIME_ID)?.runs.values() ?? [];
    return [...held].some((run) => run.thread.machine === machineId && run.thread.id === threadId);
  }

  cancelRun(runtimeId: string, runId: string, reason: string) {
    const connection = this.#connections.get(runtimeId);

    if (connection?.ready && connection.hasRun(runId)) {
      connection.post({ type: "run.cancel", runId, reason });
      return;
    }

    const held = this.#held.get(runtimeId)?.runs.get(runId);

    if (held) held.cancel = reason;
  }

  drainRuntime(runtimeId: string, reason: RunDrainReason) {
    const connection = this.#connections.get(runtimeId);

    if (!connection?.ready) return;

    for (const runId of connection.runIds()) {
      connection.post({ type: "run.drain", runId, reason });
    }
  }

  cancelRuntime(runtimeId: string, reason: string) {
    const connection = this.#connections.get(runtimeId);

    if (connection?.ready) {
      for (const runId of connection.runIds()) {
        connection.post({ type: "run.cancel", runId, reason });
      }
    }

    const held = this.#held.get(runtimeId);

    if (held) {
      for (const run of held.runs.values()) run.cancel = reason;
    }
  }

  #giveUp(runtimeId: string, message = RUNTIME_DISCONNECTED) {
    const held = this.#held.get(runtimeId);

    if (!held) return;

    clearTimeout(held.timer);
    this.#held.delete(runtimeId);
    console.warn(`Gave up on ${held.runs.size} held run(s) of runtime ${runtimeId}: ${message}`);

    for (const run of held.runs.values()) {
      void this.machineWatches.ended(run.thread.machine, run.thread.id, "lost");
      run.sink.lost(new Error(message));
    }
  }

  detach(connection: RuntimeConnection) {
    if (this.#connections.get(connection.runtimeId) === connection) {
      this.#connections.delete(connection.runtimeId);
    }
  }

  get(runtimeId: string) {
    const connection = this.#connections.get(runtimeId);
    return connection?.ready ? connection : undefined;
  }

  disconnect(runtimeId: string, reason: string) {
    this.#connections.get(runtimeId)?.close(CloseCode.Revoked, reason, true);
    this.#giveUp(runtimeId);
  }

  isOnline(runtimeId: string) {
    return this.get(runtimeId) !== undefined;
  }

  openPort(runtimeId: string, port: number, sink: ViewerSink): ViewerHandle {
    const connection = this.get(runtimeId);

    if (!connection) throw new RuntimeOfflineError("The runner of that port is offline");

    return connection.openPort(port, sink);
  }

  buildOf(runtimeId: string) {
    return this.get(runtimeId)?.build;
  }

  canUpdateOf(runtimeId: string) {
    return this.get(runtimeId)?.canUpdate ?? false;
  }

  statsOf(runtimeId: string) {
    return this.get(runtimeId)?.stats;
  }

  closeAll() {
    for (const runtimeId of this.#held.keys()) this.#giveUp(runtimeId, CONTROL_PLANE_RESTARTED);
    for (const connection of this.#connections.values())
      connection.close(undefined, undefined, true, CONTROL_PLANE_RESTARTED);
  }
}
