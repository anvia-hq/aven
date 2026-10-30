import type { MemoryStore } from "@anvia/core";
import type { RunEvent } from "@aven/protocol/events";
import { WIRE_VERSION, decodeViewerFrame, encodeViewerFrame } from "@aven/protocol/runtime-wire";
import type {
  ControlPlaneToRuntime,
  CallMethod,
  DesktopCallMethod,
  RepoAccess,
  RuntimeToControlPlane,
  RunThreadInfo,
} from "@aven/protocol/runtime-wire";

import { memoryStore } from "../../memory-store";
import { UnavailableError } from "../../errors";
import { projectsService } from "../projects/service";
import { runtimesService } from "./service";
import {
  parseAppendParams,
  parseMemoryParams,
  parseReplacePrefixParams,
  parseRuntimeFrame,
} from "./wire";

function requireCompaction(store: MemoryStore) {
  if (!store.compaction) throw new Error("This conversation store does not support compaction");
  return store.compaction;
}

export class RuntimeOfflineError extends UnavailableError {
  constructor() {
    super("The runtime for this project is offline");
  }
}

/** What a started run reports back to whoever started it. */
export type RunSink = {
  event(event: RunEvent): void;
  /** The run finished; `error` is set when the runtime reports it threw. */
  end(outcome: string, error?: string, continuation?: unknown): void;
  /** The connection dropped before the run ended. */
  lost(error: Error): void;
};

type Run = {
  thread: RunThreadInfo;
  sink: RunSink;
  /** The newest event heard from the runtime; anything at or below it is a repeat. */
  lastSeq: number;
  /** The turns of the transcript already stored, so a call sent again after a dropped reply adds nothing. */
  appended: Set<number>;
  /** A cancel asked for while the run had no connection, sent when it has one again. */
  cancel?: string;
};

// How long a run waits for its runtime to reconnect before it is given up as lost.
const DEFAULT_GRACE_MS = 60_000;

/** What a viewer's stream reports to whoever opened it (decision 0015). */
export type ViewerSink = {
  data(bytes: Uint8Array): void;
  /** The viewer ended or could not start, or the connection dropped; `reason` says why. */
  closed(reason: string): void;
};

export type ViewerHandle = {
  /** The browser's bytes for the desktop; dropped until the stream has opened. */
  write(bytes: Uint8Array): void;
  close(): void;
};

type Viewer = { sink: ViewerSink; ready: boolean };
type PendingCall = { resolve: (value: unknown) => void; reject: (error: Error) => void };

const CALL_TIMEOUT_MS = 10_000;
// Each viewer is a connection into a sandbox, so a runner is asked for only so many at once.
const MAX_VIEWERS = 32;

// One connected runtime. The runtime is not trusted: it may only touch runs this connection
// started, only while they are live, and the conversation scope always comes from our own record
// of the run, never from what the runtime sends.
export class RuntimeConnection {
  #runs = new Map<string, Run>();
  #viewers = new Map<string, Viewer>();
  #calls = new Map<string, PendingCall>();
  #closed = false;
  /** Set once the runtime has said hello with a wire version we speak. */
  #ready = false;

  constructor(
    readonly runtimeId: string,
    readonly organizationId: string | null,
    private send: (message: string | Uint8Array) => void,
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
    this.#runs.set(runId, { thread, sink, lastSeq: 0, appended: new Set() });
  }

  // Takes over a run that was following a connection that dropped, and asks for what it missed.
  adopt(runId: string, run: Run) {
    this.#runs.set(runId, run);
    this.post({ type: "run.attach", runId, after: run.lastSeq });
    if (run.cancel) this.post({ type: "run.cancel", runId, reason: run.cancel });
  }

  // Starts streaming a thread's desktop. Throws when the runtime is offline; whether the thread has
  // a running sandbox is the runtime's answer, through `sink.closed`.
  openViewer(threadId: string, sink: ViewerSink): ViewerHandle {
    if (this.#viewers.size >= MAX_VIEWERS) {
      throw new UnavailableError("Too many desktops are open on this runner");
    }
    const viewerId = crypto.randomUUID();
    this.post({ type: "desktop.open", viewerId, threadId });
    this.#viewers.set(viewerId, { sink, ready: false });
    return {
      write: (bytes) => {
        if (this.#viewers.get(viewerId)?.ready) this.send(encodeViewerFrame(viewerId, bytes));
      },
      close: () => {
        if (!this.#viewers.delete(viewerId) || this.#closed) return;
        this.post({ type: "desktop.close", viewerId });
      },
    };
  }

  // Asks the runtime about a thread's desktop. Rejects with the runtime's own error, or when it
  // does not answer in time.
  call(method: DesktopCallMethod, params: unknown, timeoutMs = CALL_TIMEOUT_MS) {
    return new Promise<unknown>((resolve, reject) => {
      const id = crypto.randomUUID();
      const finish = () => {
        clearTimeout(timer);
        this.#calls.delete(id);
      };
      const timer = setTimeout(() => {
        finish();
        reject(new Error(`The runtime did not answer ${method}`));
      }, timeoutMs);
      this.#calls.set(id, {
        resolve: (value) => (finish(), resolve(value)),
        reject: (error) => (finish(), reject(error)),
      });
      try {
        this.post({ type: "call", id, method, params });
      } catch (error) {
        this.#calls.get(id)?.reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
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
    if (message.type === "hello") return this.#hello(message.version, message.runs);
    // Nothing else is accepted from a runtime that has not introduced itself.
    if (!this.#ready) return;
    await this.#dispatch(message);
  }

  // A binary frame: a viewer's VNC bytes. Only a viewer this connection opened is heard.
  receiveBinary(frame: Uint8Array) {
    if (!this.#ready) return;
    const decoded = decodeViewerFrame(frame);
    if (!decoded) return;
    const viewer = this.#viewers.get(decoded.viewerId);
    if (viewer?.ready) viewer.sink.data(decoded.payload);
  }

  #hello(version: number, runs: string[]) {
    if (version === WIRE_VERSION) {
      this.#ready = true;
      void runtimesService.touch(this.runtimeId);
      this.hub.reclaim(this, runs);
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
      case "run.event": {
        const run = this.#runs.get(message.runId);
        // A repeat of what a reconnect replayed.
        if (!run || message.seq <= run.lastSeq) return;
        run.lastSeq = message.seq;
        run.sink.event(message.event);
        return;
      }
      case "run.end":
        this.#endRun(
          message.runId,
          message.seq,
          message.outcome,
          message.error,
          message.continuation,
        );
        return;
      case "call":
        await this.#answer(message.id, message.method, message.params);
        return;
      case "desktop.opened": {
        const viewer = this.#viewers.get(message.viewerId);
        if (!viewer) return;
        viewer.ready = true;
        return;
      }
      case "desktop.closed": {
        const viewer = this.#viewers.get(message.viewerId);
        if (!this.#viewers.delete(message.viewerId)) return;
        viewer?.sink.closed(message.reason);
        return;
      }
      case "reply": {
        const waiting = this.#calls.get(message.id);
        if (!waiting) return;
        if (message.ok) waiting.resolve(message.result);
        else waiting.reject(new Error(message.error ?? "The runtime reported an error"));
        return;
      }
    }
  }

  #endRun(runId: string, seq: number, outcome: string, error?: string, continuation?: unknown) {
    const run = this.#runs.get(runId);
    // Acknowledged whether or not it is followed, so the runtime can forget a run nobody wants.
    this.post({ type: "run.ack", runId });
    if (!run || seq <= run.lastSeq) return;
    this.#runs.delete(runId);
    run.sink.end(outcome, error, continuation);
  }

  async #answer(id: string, method: CallMethod, params: unknown) {
    try {
      const result =
        method === "repo.access" ? await this.#repo(params) : await this.#memory(method, params);
      this.#reply({ type: "reply", id, ok: true, result });
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      this.#reply({ type: "reply", id, ok: false, error: text });
    }
  }

  #reply(reply: ControlPlaneToRuntime) {
    this.send(JSON.stringify(reply));
  }

  // Only for a live run of this connection, and only the repository of that run's own thread.
  async #repo(params: unknown) {
    const { runId } = parseMemoryParams(params);
    const run = this.#runs.get(runId);
    if (!run) throw new Error("Unknown or finished run");
    return this.hub.repoAccess(run.thread.id);
  }

  async #memory(method: Exclude<CallMethod, "repo.access">, params: unknown) {
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
        // A runtime that did not hear the reply asks again.
        if (run.appended.has(turn)) return null;
        run.appended.add(turn);
        try {
          await store.append({ scope, runId, turn, messages });
        } catch (error) {
          run.appended.delete(turn);
          throw error;
        }
        return null;
      }
      case "memory.clear":
        await store.clear({ scope });
        return null;
      case "memory.snapshot":
        return requireCompaction(store).snapshot({ scope });
      case "memory.replacePrefix": {
        const { revision, messageCount, replacement } = parseReplacePrefixParams(params);
        return requireCompaction(store).replacePrefix({
          scope,
          runId,
          revision,
          messageCount,
          replacement,
        });
      }
    }
  }

  // The socket closed: calls in flight fail. Its runs are held for the runtime to reconnect to,
  // unless it was cut off on purpose (`endRuns`).
  close(code?: number, reason?: string, endRuns = false) {
    if (this.#closed) return;
    this.#closed = true;
    this.closeSocket(code, reason);
    const runs = [...this.#runs.entries()];
    this.#runs.clear();
    if (endRuns) {
      for (const [, run] of runs) run.sink.lost(new Error("The runtime disconnected"));
    } else if (runs.length > 0) {
      this.hub.hold(this.runtimeId, runs);
    }
    const viewers = [...this.#viewers.values()];
    this.#viewers.clear();
    for (const viewer of viewers) viewer.sink.closed("The runtime disconnected");
    // Settling a call takes it out of the map, which is safe to do while walking it.
    for (const waiting of this.#calls.values()) {
      waiting.reject(new Error("The runtime disconnected"));
    }
    this.hub.detach(this);
  }
}

// Tracks which runtimes are connected right now.
export class RuntimeHub {
  #connections = new Map<string, RuntimeConnection>();
  // Runs whose connection dropped, by runtime, until it reconnects or the grace period ends.
  #held = new Map<string, { runs: Map<string, Run>; timer: Timer }>();

  constructor(
    readonly store: MemoryStore,
    /** How a runtime gets to clone a thread's repository (decision 0013). */
    readonly repoAccess: (threadId: string) => Promise<RepoAccess> = () =>
      Promise.reject(new Error("Repository access is not available")),
    /** How long a run waits for its runtime to reconnect before it is given up as lost. */
    private graceMs = DEFAULT_GRACE_MS,
  ) {}

  // A runtime that reconnects replaces its previous connection.
  attach(
    runtimeId: string,
    organizationId: string | null,
    send: (message: string | Uint8Array) => void,
    closeSocket: (code?: number, reason?: string) => void,
  ) {
    this.#connections.get(runtimeId)?.close(4001, "Replaced by a newer connection");
    const connection = new RuntimeConnection(runtimeId, organizationId, send, closeSocket, this);
    this.#connections.set(runtimeId, connection);
    return connection;
  }

  /** A connection dropped with these runs still going: wait for the runtime to come back for them. */
  hold(runtimeId: string, runs: [string, Run][]) {
    const held = this.#held.get(runtimeId);
    clearTimeout(held?.timer);
    const all = held?.runs ?? new Map<string, Run>();
    for (const [runId, run] of runs) all.set(runId, run);
    const timer = setTimeout(() => this.#giveUp(runtimeId), this.graceMs);
    // A held run must not keep a process that is shutting down alive.
    timer.unref();
    this.#held.set(runtimeId, { runs: all, timer });
  }

  // A runtime said hello with the runs it still holds: it gets each one it was followed for back,
  // and is told to stop any the control plane no longer follows. Held runs it did not list are over.
  reclaim(connection: RuntimeConnection, reported: string[]) {
    const held = this.#held.get(connection.runtimeId);
    this.#held.delete(connection.runtimeId);
    clearTimeout(held?.timer);
    for (const runId of reported) {
      const run = held?.runs.get(runId);
      if (run) {
        held!.runs.delete(runId);
        connection.adopt(runId, run);
      } else {
        connection.post({
          type: "run.cancel",
          runId,
          reason: "The control plane no longer follows this run",
        });
      }
    }
    for (const run of held?.runs.values() ?? []) run.sink.lost(new Error("The runtime restarted"));
  }

  // Asks a run to stop, whether its connection is up or the run is waiting for it to come back.
  cancelRun(runtimeId: string, runId: string, reason: string) {
    const connection = this.#connections.get(runtimeId);
    if (connection?.ready && connection.hasRun(runId)) {
      connection.post({ type: "run.cancel", runId, reason });
      return;
    }
    const held = this.#held.get(runtimeId)?.runs.get(runId);
    if (held) held.cancel = reason;
  }

  #giveUp(runtimeId: string) {
    const held = this.#held.get(runtimeId);
    this.#held.delete(runtimeId);
    for (const run of held?.runs.values() ?? [])
      run.sink.lost(new Error("The runtime disconnected"));
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
    this.#connections.get(runtimeId)?.close(4002, reason, true);
    this.#giveUp(runtimeId);
  }

  isOnline(runtimeId: string) {
    return this.get(runtimeId) !== undefined;
  }

  closeAll() {
    for (const connection of this.#connections.values())
      connection.close(undefined, undefined, true);
    for (const runtimeId of this.#held.keys()) {
      clearTimeout(this.#held.get(runtimeId)?.timer);
      this.#giveUp(runtimeId);
    }
  }
}

export const runtimeHub = new RuntimeHub(memoryStore, (threadId) =>
  projectsService.repoAccess(threadId),
);
