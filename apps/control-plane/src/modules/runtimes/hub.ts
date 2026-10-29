import type { Message, MemoryStore } from "@anvia/core";
import { db } from "@aven/db/client";
import { createMemoryStore } from "@aven/agents/memory";
import type { RunEvent } from "@aven/protocol/events";
import type {
  ControlPlaneToRuntime,
  MemoryAppendParams,
  MemoryCallMethod,
  RuntimeCallMethod,
  RuntimeToControlPlane,
  RunThreadInfo,
} from "@aven/protocol/runtime-wire";

const CALL_TIMEOUT_MS = 30_000;

export class RuntimeOfflineError extends Error {
  constructor() {
    super("The runtime for this project is offline");
  }
}

/** The runtime answered a call with an error; `code` names known failures. */
export class RuntimeCallError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
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
  /** Threads this connection has run, so a job notice can only reach one of them. */
  #threads = new Set<string>();
  #pending = new Map<
    string,
    { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: Timer }
  >();
  #closed = false;

  constructor(
    readonly runtimeId: string,
    readonly organizationId: string,
    private send: (message: string) => void,
    private closeSocket: () => void,
    private hub: RuntimeHub,
  ) {}

  get closed() {
    return this.#closed;
  }

  post(message: ControlPlaneToRuntime) {
    if (this.#closed) throw new RuntimeOfflineError();
    this.send(JSON.stringify(message));
  }

  startRun(runId: string, thread: RunThreadInfo, sink: RunSink) {
    this.#runs.set(runId, { thread, sink });
    this.#threads.add(thread.id);
  }

  hasRun(runId: string) {
    return this.#runs.has(runId);
  }

  // Forgets the run so nothing more from the runtime is accepted for it.
  endRun(runId: string) {
    this.#runs.delete(runId);
  }

  call(method: RuntimeCallMethod, params: unknown): Promise<unknown> {
    if (this.#closed) return Promise.reject(new RuntimeOfflineError());
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`The runtime did not answer ${method}`));
      }, CALL_TIMEOUT_MS);
      this.#pending.set(id, { resolve, reject, timer });
      this.send(
        JSON.stringify({ type: "call", id, method, params } satisfies ControlPlaneToRuntime),
      );
    });
  }

  async receive(raw: string) {
    let message: RuntimeToControlPlane;
    try {
      message = JSON.parse(raw) as RuntimeToControlPlane;
    } catch {
      return;
    }
    switch (message.type) {
      case "run.event":
        this.#runs.get(message.runId)?.sink.event(message.event);
        return;
      case "run.end": {
        const run = this.#runs.get(message.runId);
        if (!run) return;
        this.#runs.delete(message.runId);
        run.sink.end(message.outcome, message.error);
        return;
      }
      case "job.notice": {
        if (this.#threads.has(message.threadId)) {
          this.hub.emitJobNotice(message.threadId, message.notice);
        }
        return;
      }
      case "reply": {
        const pending = this.#pending.get(message.id);
        if (!pending) return;
        this.#pending.delete(message.id);
        clearTimeout(pending.timer);
        if (message.ok) pending.resolve(message.result);
        else {
          pending.reject(
            new RuntimeCallError(message.error ?? "The runtime reported an error", message.code),
          );
        }
        return;
      }
      case "call":
        await this.#answer(message.id, message.method, message.params);
        return;
      default:
        return;
    }
  }

  async #answer(id: string, method: MemoryCallMethod, params: unknown) {
    try {
      const result = await this.#memory(method, params);
      this.send(
        JSON.stringify({ type: "reply", id, ok: true, result } satisfies ControlPlaneToRuntime),
      );
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      this.send(
        JSON.stringify({
          type: "reply",
          id,
          ok: false,
          error: text,
        } satisfies ControlPlaneToRuntime),
      );
    }
  }

  async #memory(method: MemoryCallMethod, params: unknown) {
    const { runId } = (params ?? {}) as { runId?: unknown };
    const run = typeof runId === "string" ? this.#runs.get(runId) : undefined;
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
        const { turn, messages } = params as MemoryAppendParams;
        await store.append({
          scope,
          runId: runId as string,
          turn,
          messages: messages as Message[],
        });
        return null;
      }
      case "memory.clear":
        await store.clear({ scope });
        return null;
    }
  }

  // The socket closed: in-flight runs are lost, calls in flight fail.
  close() {
    if (this.#closed) return;
    this.#closed = true;
    this.closeSocket();
    for (const [, pending] of this.#pending) {
      clearTimeout(pending.timer);
      pending.reject(new RuntimeOfflineError());
    }
    this.#pending.clear();
    const runs = [...this.#runs.values()];
    this.#runs.clear();
    for (const run of runs) run.sink.lost(new Error("The runtime disconnected"));
    this.hub.detach(this);
  }
}

// Tracks which runtimes are connected right now.
export class RuntimeHub {
  #connections = new Map<string, RuntimeConnection>();
  #jobListeners = new Set<(threadId: string, notice: string) => void>();

  constructor(readonly store: MemoryStore) {}

  // A runtime that reconnects replaces its previous connection.
  attach(
    runtimeId: string,
    organizationId: string,
    send: (message: string) => void,
    closeSocket: () => void,
  ) {
    this.#connections.get(runtimeId)?.close();
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
    return connection && !connection.closed ? connection : undefined;
  }

  isOnline(runtimeId: string) {
    return this.get(runtimeId) !== undefined;
  }

  onJobNotice(listener: (threadId: string, notice: string) => void) {
    this.#jobListeners.add(listener);
    return () => this.#jobListeners.delete(listener);
  }

  emitJobNotice(threadId: string, notice: string) {
    for (const listener of this.#jobListeners) listener(threadId, notice);
  }

  closeAll() {
    for (const connection of this.#connections.values()) connection.close();
  }
}

export const runtimeHub = new RuntimeHub(createMemoryStore(db));
