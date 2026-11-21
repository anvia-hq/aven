import { AGENT_BACKENDS, CloseCode, WIRE_VERSION } from "@aven/protocol/runtime-wire";
import { parseRuntimeFrame } from "@aven/protocol/wire/frames";
import type {
  AgentBackendKind,
  BotReplyInfo,
  BotReplyProject,
  CallMethod,
  CockpitAccess,
  ControlPlaneToRuntime,
  ReportedStats,
  RunAttachment,
  RunLens,
  RunMcpServer,
  RunMemory,
  RunModel,
  RunnerCallMethod,
  RunnerGithub,
  RunSecrets,
  RunSkill,
  RunThreadInfo,
  RuntimeToControlPlane,
  RunWebSearch,
} from "@aven/protocol/types";
import { describeError, UnavailableError } from "@aven/server-kit/errors";
import { RuntimeOfflineError } from "@aven/sandbox/offline";

import type { CockpitCaller } from "../cockpit/types";
import type { MemoryCaller } from "../memory/types";
import { PendingCalls } from "./pending-calls";
import { answerRuntimeCall } from "./runtime-calls";
import type { BotReplySink, RunSink, RuntimeHubHost, TrackedRun, ViewerSink } from "./types";
import { ViewerStreams } from "./viewer-streams";

export { RuntimeOfflineError };

export class BackendUnavailableError extends UnavailableError {
  constructor() {
    super("This thread's runner cannot drive its agent: update the runner");
  }
}

type RunEnd = Extract<RuntimeToControlPlane, { type: "run.end" }>;

export const RUNTIME_DISCONNECTED = "The runtime disconnected";

const BEFORE_BACKENDS: readonly AgentBackendKind[] = ["native"];

const knownBackends = (sent: readonly string[] | undefined): readonly AgentBackendKind[] =>
  sent === undefined ? BEFORE_BACKENDS : AGENT_BACKENDS.filter((kind) => sent.includes(kind));

export class RuntimeConnection {
  #runs = new Map<string, TrackedRun>();
  #botReplies = new Map<string, BotReplySink>();
  #viewers: ViewerStreams;
  #calls: PendingCalls;
  #closed = false;
  #ready = false;
  #build: string | undefined;
  #canUpdate = false;
  #backends: readonly AgentBackendKind[] = BEFORE_BACKENDS;
  #github: RunnerGithub | undefined;
  #stats: ReportedStats | undefined;

  constructor(
    readonly runtimeId: string,
    private send: (message: string | Uint8Array) => void,
    private closeSocket: (code?: number, reason?: string) => void,
    private hub: RuntimeHubHost,
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

  get github() {
    return this.#github;
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
      model?: RunModel;
      backend?: AgentBackendKind;
      claudeToken?: string;
      claudeModel?: string;
      claudeEffort?: string;
      codexToken?: string;
      codexModel?: string;
      codexEffort?: string;
      attachments?: RunAttachment[];
      skills?: RunSkill[];
      mcp?: RunMcpServer[];
      memory?: RunMemory;
      cockpit?: CockpitAccess;
      context?: string;
      projects?: BotReplyProject[];
      webSearch?: RunWebSearch;
      lens?: RunLens;
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

  adopt(runId: string, run: TrackedRun) {
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

  runIds() {
    return [...this.#runs.keys()];
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
        message.github,
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
    github: RunnerGithub | undefined,
  ) {
    if (version === WIRE_VERSION) {
      this.#ready = true;
      this.#backends = knownBackends(backends);
      this.#build = build;
      this.#canUpdate = canUpdate === true;
      this.#github = github;
      this.hub.onHello(this.runtimeId, { host: host === true, dirs: dirs ?? [] });
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
        this.#botReplies.get(message.replyId)?.say(message.text, message.quote, message.files);
        return;
      case "bot.activity":
        this.#botReplies.get(message.replyId)?.activity(message.label);
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
        runtimeId: this.runtimeId,
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
    for (const reply of replies) reply.lost(new Error(RUNTIME_DISCONNECTED));
  }

  close(code?: number, reason?: string, endRuns = false, lostMessage = RUNTIME_DISCONNECTED) {
    if (this.#closed) return;

    this.#closed = true;
    this.closeSocket(code, reason);
    const runs = [...this.#runs.entries()];
    this.#runs.clear();

    if (endRuns) {
      for (const [, run] of runs) {
        void this.hub.machineWatches.ended(run.thread.machine, run.thread.id, "lost");
        run.sink.lost(new Error(lostMessage));
      }
    } else if (runs.length > 0) {
      this.hub.hold(this.runtimeId, runs);
    }

    if (runs.length > 0) {
      console.warn(
        `Runtime ${this.runtimeId} closed (${reason ?? code ?? "no reason given"}) with ${runs.length} run(s) open: ${endRuns ? "ended" : "held"}`,
      );
    }

    this.#loseBotReplies();
    this.#viewers.closeAll(lostMessage);
    this.#calls.rejectAll(lostMessage);
    this.hub.detach(this);
  }
}
