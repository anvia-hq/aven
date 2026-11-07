import type { MemoryStore } from "@anvia/core";
import type { RunEvent } from "@aven/protocol/events";
import type { CockpitAccess } from "@aven/protocol/cockpit";
import type { RunMemory } from "@aven/protocol/memory";
import { CloseCode, WIRE_VERSION } from "@aven/protocol/runtime-wire";
import type {
  McpConnectResult,
  BotReplyInfo,
  CallMethod,
  ControlPlaneToRuntime,
  RepoAccess,
  RunAttachment,
  RunMcpServer,
  RunSkill,
  RunModel,
  RunnerCallMethod,
  RunOutcome,
  ReportedStats,
  RuntimeToControlPlane,
  RunThreadInfo,
} from "@aven/protocol/runtime-wire";

import { describeError, UnavailableError } from "../../errors";
import type { ThreadForks } from "../threads/forks";
import type { ProcessEnds } from "../threads/process-ends";
import type { CockpitCaller } from "../cockpit/commands";
import type { MemoryCaller } from "../memory/commands";
import { PendingCalls } from "./pending-calls";
import { answerRuntimeCall, type CallBotReply } from "./runtime-calls";
import { runtimesService } from "./service";
import { ViewerStreams, type ViewerSink } from "./viewer-streams";
import { parseRuntimeFrame } from "./wire";

export class RuntimeOfflineError extends UnavailableError {
  constructor(message = "The runtime for this project is offline") {
    super(message);
  }
}

export type RunSink = {
  event(event: RunEvent): void;
  end(outcome: RunOutcome, error?: string, continuation?: unknown): void;
  lost(error: Error): void;
};

export type BotReplySink = CallBotReply & {
  say(text: string): void;
  end(error?: string): void;
  lost(error: Error): void;
};

type Run = {
  thread: RunThreadInfo;
  sink: RunSink;
  lastSeq: number;
  appended: Set<number>;
  skills: Set<string>;
  mcp: Set<string>;
  memory?: MemoryCaller;
  cockpit?: CockpitCaller;
  cancel?: string;
};

type RunEnd = Extract<RuntimeToControlPlane, { type: "run.end" }>;

export const DEFAULT_GRACE_MS = 60_000;

export class RuntimeConnection {
  #runs = new Map<string, Run>();
  #botReplies = new Map<string, BotReplySink>();
  #viewers: ViewerStreams;
  #calls: PendingCalls;
  #closed = false;
  #ready = false;
  #build: string | undefined;
  #canUpdate = false;
  #stats: ReportedStats | undefined;

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

  get build() {
    return this.#build;
  }

  get canUpdate() {
    return this.#canUpdate;
  }

  get stats() {
    return this.#stats;
  }

  post(message: ControlPlaneToRuntime) {
    if (this.#closed) throw new RuntimeOfflineError();
    this.send(JSON.stringify(message));
  }

  startRun(
    runId: string,
    thread: RunThreadInfo,
    sink: RunSink,
    skills: string[] = [],
    mcp: string[] = [],
    memory?: MemoryCaller,
    cockpit?: CockpitCaller,
  ) {
    this.#runs.set(runId, {
      thread,
      sink,
      lastSeq: 0,
      appended: new Set(),
      skills: new Set(skills),
      mcp: new Set(mcp),
      memory,
      cockpit,
    });
  }

  startBotReply(
    replyId: string,
    input: {
      bot: BotReplyInfo;
      prompt: string;
      model: RunModel;
      attachments?: RunAttachment[];
      skills?: RunSkill[];
      mcp?: RunMcpServer[];
      memory?: RunMemory;
      cockpit?: CockpitAccess;
    },
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

  cancelBotReply(replyId: string, reason: string) {
    if (this.#botReplies.has(replyId)) this.post({ type: "bot.cancel", replyId, reason });
  }

  adopt(runId: string, run: Run) {
    this.#runs.set(runId, run);
    this.post({ type: "run.attach", runId, after: run.lastSeq });
    if (run.cancel) this.post({ type: "run.cancel", runId, reason: run.cancel });
  }

  openViewer(threadId: string, sink: ViewerSink) {
    return this.#viewers.open(threadId, sink);
  }

  openTerminal(threadId: string, size: { cols: number; rows: number }, sink: ViewerSink) {
    return this.#viewers.openTerminal(threadId, size, sink);
  }

  call(method: RunnerCallMethod, params: unknown, timeoutMs?: number) {
    return this.#calls.call(method, params, timeoutMs);
  }

  hasRun(runId: string) {
    return this.#runs.has(runId);
  }

  endRun(runId: string) {
    this.#runs.delete(runId);
  }

  async receive(raw: string) {
    const message = parseRuntimeFrame(raw);
    if (!message) return;
    if (message.type === "hello")
      return this.#hello(message.version, message.runs, message.build, message.canUpdate);
    if (!this.#ready) return;
    await this.#dispatch(message);
  }

  receiveBinary(frame: Uint8Array) {
    if (!this.#ready) return;
    this.#viewers.receive(frame);
  }

  #hello(
    version: number,
    runs: string[],
    build: string | undefined,
    canUpdate: boolean | undefined,
  ) {
    if (version === WIRE_VERSION) {
      this.#ready = true;
      this.#build = build;
      this.#canUpdate = canUpdate === true;
      void runtimesService.touch(this.runtimeId);
      this.hub.reclaim(this, runs);
      return;
    }
    this.close(
      CloseCode.UnsupportedVersion,
      `Unsupported runtime version ${version}; this control plane speaks ${WIRE_VERSION}`,
    );
  }

  async #dispatch(message: RuntimeToControlPlane) {
    switch (message.type) {
      case "run.event": {
        const run = this.#runs.get(message.runId);
        if (!run || message.seq <= run.lastSeq) return;
        run.lastSeq = message.seq;
        run.sink.event(message.event);
        return;
      }
      case "run.end":
        this.#endRun(message);
        return;
      case "host.stats":
        this.#stats = { ...message.stats, reportedAt: new Date().toISOString() };
        return;
      case "process.ended":
        await this.hub.processEnds
          .ended(this.runtimeId, message)
          .catch((error: unknown) =>
            console.warn(`Could not wake a thread for an ended process:`, describeError(error)),
          );
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
        mcpReport: this.hub.mcpReport,
        forks: this.hub.forks,
      });
      this.#reply({ type: "reply", id, ok: true, result });
    } catch (error) {
      this.#reply({ type: "reply", id, ok: false, error: describeError(error) });
    }
  }

  #reply(reply: ControlPlaneToRuntime) {
    this.send(JSON.stringify(reply));
  }

  #loseBotReplies() {
    const replies = [...this.#botReplies.values()];
    this.#botReplies.clear();
    for (const reply of replies) reply.lost(new Error("The runtime disconnected"));
  }

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

export class RuntimeHub {
  #connections = new Map<string, RuntimeConnection>();
  #held = new Map<string, { runs: Map<string, Run>; timer: Timer }>();

  constructor(
    readonly store: MemoryStore,
    readonly repoAccess: (threadId: string) => Promise<RepoAccess> = () =>
      Promise.reject(new Error("Repository access is not available")),
    private graceMs = DEFAULT_GRACE_MS,
    readonly skillArchive: (digest: string) => Promise<Uint8Array | undefined> = async () =>
      undefined,
    readonly mcpReport: (results: McpConnectResult[]) => Promise<void> = async () => undefined,
  ) {}

  forks: ThreadForks = {
    start: () => Promise.reject(new Error("Forks are not available")),
    status: () => Promise.reject(new Error("Forks are not available")),
    ended: async () => undefined,
  };

  processEnds: ProcessEnds = { ended: async () => undefined };

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

  hold(runtimeId: string, runs: [string, Run][]) {
    const held = this.#held.get(runtimeId);
    clearTimeout(held?.timer);
    const all = held?.runs ?? new Map<string, Run>();
    for (const [runId, run] of runs) all.set(runId, run);
    const timer = setTimeout(() => this.#giveUp(runtimeId), this.graceMs);
    timer.unref();
    this.#held.set(runtimeId, { runs: all, timer });
  }

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

  disconnect(runtimeId: string, reason: string) {
    this.#connections.get(runtimeId)?.close(CloseCode.Revoked, reason, true);
    this.#giveUp(runtimeId);
  }

  isOnline(runtimeId: string) {
    return this.get(runtimeId) !== undefined;
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
    for (const connection of this.#connections.values())
      connection.close(undefined, undefined, true);
    for (const runtimeId of this.#held.keys()) {
      clearTimeout(this.#held.get(runtimeId)?.timer);
      this.#giveUp(runtimeId);
    }
  }
}
