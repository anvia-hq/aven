import type { MemoryStore } from "@anvia/core";
import { AGENT_BACKENDS, CloseCode, WIRE_VERSION } from "@aven/protocol/runtime-wire";

import { describeError, UnavailableError } from "../../errors";
import { MachineProcessWatch } from "./machine-process-watch";
import { PendingCalls } from "./pending-calls";
import { answerRuntimeCall } from "./runtime-calls";
import { LOCAL_RUNTIME_ID, runtimesService } from "./service";
import { ViewerStreams } from "./viewer-streams";
import { parseRuntimeFrame } from "./wire";
import type { CockpitCaller } from "../cockpit/types";
import type { MemoryCaller } from "../memory/types";
import type { BotReplySink, MachineRelay, RunSink, ViewerHandle, ViewerSink } from "./types";
import type { ProcessEnds, ThreadForks } from "../threads/types";
import type {
  AgentBackendKind,
  BotReplyInfo,
  CallMethod,
  CockpitAccess,
  ControlPlaneToRuntime,
  McpConnectResult,
  RepoAccess,
  ReportedStats,
  RunAttachment,
  RunMcpServer,
  RunMemory,
  RunModel,
  RunnerCallMethod,
  RunSecrets,
  RunSkill,
  RunThreadInfo,
  RuntimeToControlPlane,
} from "@aven/protocol/types";

export class RuntimeOfflineError extends UnavailableError {
  constructor(message = "The runtime for this project is offline") {
    super(message);
  }
}

export class BackendUnavailableError extends UnavailableError {
  constructor() {
    super("This thread's runner cannot drive its agent: update the runner");
  }
}

type Run = {
  thread: RunThreadInfo;
  sink: RunSink;
  lastSeq: number;
  appended: Set<number>;
  skills: Set<string>;
  mcp: Set<string>;
  memory?: MemoryCaller;
  cockpit?: CockpitCaller;
  secrets?: RunSecrets;
  cancel?: string;
};

type RunEnd = Extract<RuntimeToControlPlane, { type: "run.end" }>;

export const DEFAULT_GRACE_MS = 60_000;

const BEFORE_BACKENDS: readonly AgentBackendKind[] = ["native"];

const knownBackends = (sent: readonly string[] | undefined): readonly AgentBackendKind[] =>
  sent === undefined ? BEFORE_BACKENDS : AGENT_BACKENDS.filter((kind) => sent.includes(kind));

export class RuntimeConnection {
  #runs = new Map<string, Run>();
  #botReplies = new Map<string, BotReplySink>();
  #viewers: ViewerStreams;
  #calls: PendingCalls;
  #closed = false;
  #ready = false;
  #build: string | undefined;
  #canUpdate = false;
  #backends: readonly AgentBackendKind[] = BEFORE_BACKENDS;
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

  offers(backend: AgentBackendKind) {
    return this.#backends.includes(backend);
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
    secrets?: RunSecrets,
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
      secrets,
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
      machine?: string;
    },
    sink: BotReplySink,
  ) {
    const { machine, ...body } = input;
    const live = Object.assign(sink, { botId: input.bot.id, machine });
    this.#botReplies.set(replyId, live);
    try {
      this.post({ type: "bot.reply", replyId, ...body, machine });
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
    this.post({ type: "run.attach", runId, after: run.lastSeq, secrets: run.secrets });

    if (run.cancel) this.post({ type: "run.cancel", runId, reason: run.cancel });
  }

  openTerminal(threadId: string, size: { cols: number; rows: number }, sink: ViewerSink) {
    return this.#viewers.openTerminal(threadId, size, sink);
  }

  openPort(port: number, sink: ViewerSink) {
    return this.#viewers.openPort(this.runtimeId, port, sink);
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

  hasRunOnMachine(machineId: string, threadId: string) {
    return [...this.#runs.values()].some(
      (run) => run.thread.machine === machineId && run.thread.id === threadId,
    );
  }

  async receive(raw: string) {
    const message = parseRuntimeFrame(raw);

    if (!message) return;

    if (message.type === "hello")
      return this.#hello(
        message.version,
        message.runs,
        message.build,
        message.canUpdate,
        message.host,
        message.dirs,
        message.backends,
        message.guests,
      );

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
    host: boolean | undefined,
    dirs: string[] | undefined,
    backends: string[] | undefined,
    guests: string[] | undefined,
  ) {
    if (version === WIRE_VERSION) {
      this.#ready = true;
      this.#backends = knownBackends(backends);
      this.#build = build;
      this.#canUpdate = canUpdate === true;
      void runtimesService.touch(this.runtimeId);
      void runtimesService.setHost(this.runtimeId, host === true);
      void runtimesService.setDirectories(this.runtimeId, dirs ?? []);
      this.hub.reclaim(this, runs);
      void this.hub.machineWatches.hello(this.runtimeId, guests, (threadId) =>
        this.hub.runsOnMachine(this.runtimeId, threadId),
      );
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
        if (message.method === "machine.call") {
          void this.#answer(message.id, message.method, message.params);
          return;
        }

        await this.#answer(message.id, message.method, message.params);
        return;
      case "terminal.opened":
        this.#viewers.opened(message.viewerId, "terminal");
        return;
      case "terminal.closed":
        this.#viewers.closed(message.viewerId, "terminal", message.reason);
        return;
      case "port.opened":
        this.#viewers.opened(message.viewerId, "port");
        return;
      case "port.closed":
        this.#viewers.closed(message.viewerId, "port", message.reason);
        return;
      case "reply":
        this.#calls.settle(message);
    }
  }

  #endRun({ runId, seq, outcome, error, continuation }: RunEnd) {
    const run = this.#runs.get(runId);
    this.post({ type: "run.ack", runId });

    if (!run || seq <= run.lastSeq) return;

    this.#runs.delete(runId);
    run.sink.end(outcome, error, continuation);
    void this.hub.machineWatches.ended(run.thread.machine, run.thread.id, outcome);
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
        folderOf: this.hub.folderOf,
        skillArchive: this.hub.skillArchive,
        mcpReport: this.hub.mcpReport,
        forks: this.hub.forks,
        machines: this.hub.machines,
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
      for (const [, run] of runs) {
        void this.hub.machineWatches.ended(run.thread.machine, run.thread.id, "lost");
        run.sink.lost(new Error("The runtime disconnected"));
      }
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
    readonly folderOf: (threadId: string) => Promise<string | null> = async () => null,
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

  #giveUp(runtimeId: string, message = "The runtime disconnected") {
    const held = this.#held.get(runtimeId);

    if (!held) return;

    clearTimeout(held.timer);
    this.#held.delete(runtimeId);
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
    for (const runtimeId of this.#held.keys())
      this.#giveUp(runtimeId, "The control plane shut down");
    for (const connection of this.#connections.values())
      connection.close(undefined, undefined, true);
  }
}
