import type { MemoryStore } from "@anvia/core";
import type { RunEvent } from "@aven/protocol/events";
import { CloseCode, WIRE_VERSION } from "@aven/protocol/runtime-wire";
import type {
  BotCreated,
  BotCreateParams,
  BotMemoryParams,
  BotReplyInfo,
  BotUpdated,
  BotUpdateParams,
  CallMethod,
  ControlPlaneToRuntime,
  RepoAccess,
  RunModel,
  RunnerCallMethod,
  RunOutcome,
  RuntimeToControlPlane,
  RunThreadInfo,
} from "@aven/protocol/runtime-wire";

import { describeError, UnavailableError } from "../../errors";
import { PendingCalls } from "./pending-calls";
import { answerRuntimeCall } from "./runtime-calls";
import { runtimesService } from "./service";
import { ViewerStreams, type ViewerSink } from "./viewer-streams";
import { parseRuntimeFrame } from "./wire";

export class RuntimeOfflineError extends UnavailableError {
  constructor(message = "The runtime for this project is offline") {
    super(message);
  }
}

/** What a started run reports back to whoever started it. */
export type RunSink = {
  event(event: RunEvent): void;
  /** The run finished; `error` is set when the runtime reports it threw. */
  end(outcome: RunOutcome, error?: string, continuation?: unknown): void;
  /** The connection dropped before the run ended. */
  lost(error: Error): void;
};

/** What a started bot reply reports back (decision 0059). */
export type BotReplySink = {
  /** The bot sent a message. */
  say(text: string): void;
  /** The reply finished; `error` is set when the runner reports the bot's agent threw. */
  end(error?: string): void;
  /** The connection dropped before the reply ended: a reply does not wait for the runner to return. */
  lost(error: Error): void;
  /** Answers the runner's calls about the bot's conversation, for this reply's bot. */
  memory(params: BotMemoryParams): Promise<unknown>;
  /** Makes a bot for this reply's person, if the reply's bot may (decision 0060). */
  create(params: BotCreateParams): Promise<BotCreated>;
  /** Changes this reply's own bot (decision 0061). */
  update(params: BotUpdateParams): Promise<BotUpdated>;
};

type Run = {
  thread: RunThreadInfo;
  sink: RunSink;
  /** The newest event heard from the runtime; anything at or below it is a repeat. */
  lastSeq: number;
  /** The turns of the transcript already stored, so a call sent again after a dropped reply adds nothing. */
  appended: Set<number>;
  /** The digests of the run's skills: the only ones its runtime may fetch (decision 0035). */
  skills: Set<string>;
  /** A cancel asked for while the run had no connection, sent when it has one again. */
  cancel?: string;
};

type RunEnd = Extract<RuntimeToControlPlane, { type: "run.end" }>;

/** How long a run waits for its runtime to reconnect before it is given up as lost. */
export const DEFAULT_GRACE_MS = 60_000;

// One connected runtime. The runtime is not trusted: it may only touch runs this connection
// started, only while they are live, and the conversation scope always comes from our own record
// of the run, never from what the runtime sends.
export class RuntimeConnection {
  #runs = new Map<string, Run>();
  #botReplies = new Map<string, BotReplySink>();
  #viewers: ViewerStreams;
  #calls: PendingCalls;
  #closed = false;
  /** Set once the runtime has said hello with a wire version we speak. */
  #ready = false;

  constructor(
    readonly runtimeId: string,
    private send: (message: string | Uint8Array) => void,
    private closeSocket: (code?: number, reason?: string) => void,
    private hub: RuntimeHub,
  ) {
    const post = (message: ControlPlaneToRuntime) => this.post(message);
    this.#viewers = new ViewerStreams(post, send, () => this.#closed);
    this.#calls = new PendingCalls(post);
  }

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

  startRun(runId: string, thread: RunThreadInfo, sink: RunSink, skills: string[] = []) {
    this.#runs.set(runId, {
      thread,
      sink,
      lastSeq: 0,
      appended: new Set(),
      skills: new Set(skills),
    });
  }

  // Has the runner's bot answer a message; what it says comes back to `sink`. Throws when the
  // runner is offline.
  startBotReply(
    replyId: string,
    input: { bot: BotReplyInfo; prompt: string; model: RunModel },
    sink: BotReplySink,
  ) {
    this.#botReplies.set(replyId, sink);
    try {
      this.post({ type: "bot.reply", replyId, ...input });
    } catch (error) {
      this.#botReplies.delete(replyId);
      throw error;
    }
  }

  // Asks the runner to stop a reply; it ends with the runner's `bot.end`.
  cancelBotReply(replyId: string, reason: string) {
    if (this.#botReplies.has(replyId)) this.post({ type: "bot.cancel", replyId, reason });
  }

  // Takes over a run that was following a connection that dropped, and asks for what it missed.
  adopt(runId: string, run: Run) {
    this.#runs.set(runId, run);
    this.post({ type: "run.attach", runId, after: run.lastSeq });
    if (run.cancel) this.post({ type: "run.cancel", runId, reason: run.cancel });
  }

  // Starts streaming a thread's desktop. Throws when the runtime is offline; whether the thread has
  // a running sandbox is the runtime's answer, through `sink.closed`.
  openViewer(threadId: string, sink: ViewerSink) {
    return this.#viewers.open(threadId, sink);
  }

  // Starts a shell in a thread's sandbox, with the same rules as `openViewer` (decision 0053).
  openTerminal(threadId: string, size: { cols: number; rows: number }, sink: ViewerSink) {
    return this.#viewers.openTerminal(threadId, size, sink);
  }

  // Asks the runtime about a thread (its desktop, changes or files). Rejects with the runtime's own
  // error, or when it does not answer in time.
  call(method: RunnerCallMethod, params: unknown, timeoutMs?: number) {
    return this.#calls.call(method, params, timeoutMs);
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

  // A binary frame: a viewer's VNC bytes or a terminal's.
  receiveBinary(frame: Uint8Array) {
    if (!this.#ready) return;
    this.#viewers.receive(frame);
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
      CloseCode.UnsupportedVersion,
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
        this.#endRun(message);
        return;
      case "bot.say":
        this.#botReplies.get(message.replyId)?.say(message.text);
        return;
      case "bot.end":
        this.#endBotReply(message.replyId, message.error);
        return;
      case "call":
        await this.#answer(message.id, message.method, message.params);
        return;
      case "desktop.opened":
        this.#viewers.opened(message.viewerId, "desktop");
        return;
      case "desktop.closed":
        this.#viewers.closed(message.viewerId, "desktop", message.reason);
        return;
      case "terminal.opened":
        this.#viewers.opened(message.viewerId, "terminal");
        return;
      case "terminal.closed":
        this.#viewers.closed(message.viewerId, "terminal", message.reason);
        return;
      case "reply":
        this.#calls.settle(message);
        return;
    }
  }

  #endRun({ runId, seq, outcome, error, continuation }: RunEnd) {
    const run = this.#runs.get(runId);
    // Acknowledged whether or not it is followed, so the runtime can forget a run nobody wants.
    this.post({ type: "run.ack", runId });
    if (!run || seq <= run.lastSeq) return;
    this.#runs.delete(runId);
    run.sink.end(outcome, error, continuation);
  }

  #endBotReply(replyId: string, error?: string) {
    const sink = this.#botReplies.get(replyId);
    this.#botReplies.delete(replyId);
    sink?.end(error);
  }

  async #answer(id: string, method: CallMethod, params: unknown) {
    try {
      const result = await answerRuntimeCall(method, params, {
        findRun: (runId) => this.#runs.get(runId),
        findBotReply: (replyId) => this.#botReplies.get(replyId),
        store: this.hub.store,
        repoAccess: this.hub.repoAccess,
        skillArchive: this.hub.skillArchive,
      });
      this.#reply({ type: "reply", id, ok: true, result });
    } catch (error) {
      this.#reply({ type: "reply", id, ok: false, error: describeError(error) });
    }
  }

  #reply(reply: ControlPlaneToRuntime) {
    this.send(JSON.stringify(reply));
  }

  // A bot's reply is not held for the runner to come back: it ends, and the person says it again.
  #loseBotReplies() {
    const replies = [...this.#botReplies.values()];
    this.#botReplies.clear();
    for (const reply of replies) reply.lost(new Error("The runtime disconnected"));
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
    this.#loseBotReplies();
    this.#viewers.closeAll("The runtime disconnected");
    this.#calls.rejectAll("The runtime disconnected");
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
    /** A skill's archive by its digest (decision 0035). */
    readonly skillArchive: (digest: string) => Promise<Uint8Array | undefined> = async () =>
      undefined,
  ) {}

  // A runtime that reconnects replaces its previous connection.
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
    const runs = held?.runs ?? new Map<string, Run>();
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
    for (const run of runs.values()) run.sink.lost(new Error("The runtime restarted"));
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
    this.#connections.get(runtimeId)?.close(CloseCode.Revoked, reason, true);
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
