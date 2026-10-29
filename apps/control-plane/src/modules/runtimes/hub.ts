import type { MemoryStore } from "@anvia/core";
import type { RunEvent } from "@aven/protocol/events";
import { WIRE_VERSION } from "@aven/protocol/runtime-wire";
import type {
  ControlPlaneToRuntime,
  MemoryCallMethod,
  RuntimeToControlPlane,
  RunThreadInfo,
} from "@aven/protocol/runtime-wire";

import { memoryStore } from "../../memory-store";
import { UnavailableError } from "../../errors";
import { runtimesService } from "./service";
import { parseAppendParams, parseMemoryParams, parseRuntimeFrame } from "./wire";

export class RuntimeOfflineError extends UnavailableError {
  constructor() {
    super("The runtime for this project is offline");
  }
}

/** What a started run reports back to whoever started it. */
export type RunSink = {
  event(event: RunEvent): void;
  /** The run finished; `error` is set when the runtime reports it threw. */
  end(outcome: string, error?: string): void;
  /** The connection dropped before the run ended. */
  lost(error: Error): void;
};

type Run = { thread: RunThreadInfo; sink: RunSink };

// One connected runtime. The runtime is not trusted: it may only touch runs this connection
// started, only while they are live, and the conversation scope always comes from our own record
// of the run, never from what the runtime sends.
export class RuntimeConnection {
  #runs = new Map<string, Run>();
  #closed = false;
  /** Set once the runtime has said hello with a wire version we speak. */
  #ready = false;

  constructor(
    readonly runtimeId: string,
    readonly organizationId: string | null,
    private send: (message: string) => void,
    private closeSocket: (code?: number, reason?: string) => void,
    private hub: RuntimeHub,
  ) {}

  get ready() {
    return this.#ready && !this.#closed;
  }

  get closed() {
    return this.#closed;
  }

  post(message: ControlPlaneToRuntime) {
    if (this.#closed) throw new RuntimeOfflineError();
    this.send(JSON.stringify(message));
  }

  startRun(runId: string, thread: RunThreadInfo, sink: RunSink) {
    this.#runs.set(runId, { thread, sink });
  }

  hasRun(runId: string) {
    return this.#runs.has(runId);
  }

  // Forgets the run so nothing more from the runtime is accepted for it.
  endRun(runId: string) {
    this.#runs.delete(runId);
  }

  async receive(raw: string) {
    const message = parseRuntimeFrame(raw);
    if (!message) return;
    if (message.type === "hello") return this.#hello(message.version);
    // Nothing else is accepted from a runtime that has not introduced itself.
    if (!this.#ready) return;
    await this.#dispatch(message);
  }

  #hello(version: number) {
    if (version === WIRE_VERSION) {
      this.#ready = true;
      void runtimesService.touch(this.runtimeId);
      return;
    }
    // An incompatible runtime is refused with a reason it can show, not left to fail oddly.
    this.close(
      4000,
      `Unsupported runtime version ${version}; this control plane speaks ${WIRE_VERSION}`,
    );
  }

  async #dispatch(message: RuntimeToControlPlane) {
    switch (message.type) {
      case "run.event":
        this.#runs.get(message.runId)?.sink.event(message.event);
        return;
      case "run.end":
        this.#endRun(message.runId, message.outcome, message.error);
        return;
      case "call":
        await this.#answer(message.id, message.method, message.params);
        return;
    }
  }

  #endRun(runId: string, outcome: string, error?: string) {
    const run = this.#runs.get(runId);
    if (!run) return;
    this.#runs.delete(runId);
    run.sink.end(outcome, error);
  }

  async #answer(id: string, method: MemoryCallMethod, params: unknown) {
    try {
      this.#reply({ type: "reply", id, ok: true, result: await this.#memory(method, params) });
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      this.#reply({ type: "reply", id, ok: false, error: text });
    }
  }

  #reply(reply: ControlPlaneToRuntime) {
    this.send(JSON.stringify(reply));
  }

  async #memory(method: MemoryCallMethod, params: unknown) {
    const { runId } = parseMemoryParams(params);
    const run = this.#runs.get(runId);
    if (!run) throw new Error("Unknown or finished run");
    const scope = {
      sessionId: run.thread.id,
      metadata: { organizationId: run.thread.organizationId },
    };
    const store = this.hub.store;
    switch (method) {
      case "memory.load":
        return store.load({ scope });
      case "memory.append": {
        const { turn, messages } = parseAppendParams(params);
        await store.append({ scope, runId, turn, messages });
        return null;
      }
      case "memory.clear":
        await store.clear({ scope });
        return null;
    }
  }

  // The socket closed: in-flight runs are lost, calls in flight fail.
  close(code?: number, reason?: string) {
    if (this.#closed) return;
    this.#closed = true;
    this.closeSocket(code, reason);
    const runs = [...this.#runs.values()];
    this.#runs.clear();
    for (const run of runs) run.sink.lost(new Error("The runtime disconnected"));
    this.hub.detach(this);
  }
}

// Tracks which runtimes are connected right now.
export class RuntimeHub {
  #connections = new Map<string, RuntimeConnection>();

  constructor(readonly store: MemoryStore) {}

  // A runtime that reconnects replaces its previous connection.
  attach(
    runtimeId: string,
    organizationId: string | null,
    send: (message: string) => void,
    closeSocket: (code?: number, reason?: string) => void,
  ) {
    this.#connections.get(runtimeId)?.close(4001, "Replaced by a newer connection");
    const connection = new RuntimeConnection(runtimeId, organizationId, send, closeSocket, this);
    this.#connections.set(runtimeId, connection);
    return connection;
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

  // Cuts a runtime off, e.g. when it is revoked or its token rotated.
  disconnect(runtimeId: string, reason: string) {
    this.#connections.get(runtimeId)?.close(4002, reason);
  }

  isOnline(runtimeId: string) {
    return this.get(runtimeId) !== undefined;
  }

  closeAll() {
    for (const connection of this.#connections.values()) connection.close();
  }
}

export const runtimeHub = new RuntimeHub(memoryStore);
