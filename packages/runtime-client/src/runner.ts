import { dirname } from "node:path";

import { createCodingAgent } from "@aven/agents/coding-agent";
import { createCompactionAgent } from "@aven/agents/compaction-agent";
import { subagentInstructions } from "@aven/agents/subagent-instruction";
import { SUBAGENT_MAX_TURNS } from "@aven/agents/subagents";
import { errorMessage } from "@aven/agents/values";
import {
  WIRE_VERSION,
  CloseCode,
  type ControlPlaneToRuntime,
  type RuntimeToControlPlane,
} from "@aven/protocol/runtime-wire";
import { decodeViewerFrame } from "@aven/protocol/viewer-frame";

import {
  BotReplies,
  defaultCreateBotAgent,
  type BotRepliesContext,
  type CreateBotReplyAgent,
} from "./bot-replies";
import { createControlPlaneCalls } from "./control-plane-calls";
import { DesktopViewers, type ViewerLink } from "./desktop-viewers";
import { cpuSampler, readHostStats } from "./host-stats";
import { IdleRelease } from "./idle-release";
import { createRunnerCalls } from "./runner-calls";
import { TerminalSessions } from "./terminal-sessions";
import { DurableRuns } from "./durable-runs";
import { createRunDriver, type CreateRuntimeAgent, type DriverContext } from "./run-driver";
import { RunOutbox, openRunDatabase } from "./run-outbox";
import { RunRecords, agentsOf } from "./run-records";
import type { ThreadSandbox, ThreadWorkspaces } from "./sandbox";

// Builds the agent for a run. The model is reached through the control plane's gateway with the
// run's token; this process never holds a provider key. The conversation is durable's own, so the
// agent has no memory store.
export const defaultCreateAgent =
  (origin: string): CreateRuntimeAgent =>
  ({ id, attended, tools, skills, envNames, mcp, memory, model, role, compact }) => {
    if (!model) throw new Error("The control plane sent no model for this run");
    if (compact) {
      return createCompactionAgent({
        id,
        provider: model.provider,
        modelId: model.modelId,
        apiKey: model.gatewayToken,
        baseUrl: `${origin}${model.gatewayPath}`,
        reasoningEffort: model.reasoningEffort,
        effortLevels: model.effortLevels,
        contextWindow: model.contextWindow,
      });
    }
    return createCodingAgent({
      id,
      // Durable journals model retries; subagents run outside it and keep their own policy.
      retries: role ? undefined : false,
      questions: attended,
      instructions: role && subagentInstructions(role),
      maxTurns: role && SUBAGENT_MAX_TURNS,
      provider: model.provider,
      modelId: model.modelId,
      apiKey: model.gatewayToken,
      baseUrl: `${origin}${model.gatewayPath}`,
      reasoningEffort: model.reasoningEffort,
      effortLevels: model.effortLevels,
      contextWindow: model.contextWindow,
      tools,
      skills,
      envNames,
      mcp,
      memory,
    });
  };

export type RuntimeOptions = {
  /** The control plane's WebSocket URL, e.g. ws://localhost:8000/runtimes/connect. */
  url: string;
  /** The registration token shown once when the runtime was created. */
  token: string;
  /** The release of the `aven` this runner is, told to the control plane in `hello`. */
  build?: string;
  createAgent?: CreateRuntimeAgent;
  /** Builds the agent of a bot's reply (decision 0059). Replaced in tests. */
  createBotAgent?: CreateBotReplyAgent;
  /** How long a bot's message "types" before it is sent. Replaced in tests. */
  typingPause?: BotRepliesContext["pause"];
  /** Gives each thread its sandbox and workspace (decision 0010). */
  sandbox: ThreadWorkspaces;
  /** The SQLite file runs are journaled in (decision 0021). Only one runner may use it at a time. */
  journalPath: string;
  /** Where what a run told the control plane, and how far it got, is kept (decision 0024). Defaults to beside the journal. */
  statePath?: string;
  /**
   * The control plane refused this runtime for good (revoked, token rotated, or an incompatible
   * version), so reconnecting would not help. `reason` says why.
   */
  onRefused?: (reason: string) => void;
  /** How long a call to the control plane may take, a dropped connection included. Default 60 seconds. */
  callTimeoutMs?: number;
  /**
   * A thread with no run and no running process for this long gives up its sandbox (its files
   * stay). Default 30 minutes.
   */
  idleReleaseMs?: number;
  /** How often the machine's load is told to the control plane (decision 0091). Default 15 seconds. */
  statsIntervalMs?: number;
};

const DEFAULT_STATS_INTERVAL_MS = 15_000;
const RECONNECT_MIN_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
// About as long as the control plane holds a run for its runtime to come back.
const DEFAULT_CALL_TIMEOUT_MS = 60_000;
const DEFAULT_IDLE_RELEASE_MS = 30 * 60_000;

/**
 * Where the control plane's HTTP API is, from the URL the runner connects to: the same address with
 * an http scheme and without `/runtimes/connect`. A control plane behind a prefix (the web entry
 * serves it at `/api`) keeps it: the gateway at `/runtimes/gateway` is under it too, and without it
 * the request reaches the web app, which answers 405.
 */
export function controlPlaneBase(connectUrl: string) {
  const url = new URL(connectUrl.replace(/^ws/, "http"));
  // The prefix is what comes before `/runtimes/connect`; an address that does not end so has none to keep.
  const prefix = /^(.*)\/runtimes\/connect\/?$/.exec(url.pathname)?.[1] ?? "";
  return `${url.origin}${prefix}`;
}

// Connects out to the control plane and runs whatever it is told to, until stopped. Reconnects
// with backoff; runs in flight when the link drops are abandoned (the control plane ends them).
export function startRuntime(options: RuntimeOptions) {
  // The control plane's own address, for its model gateway: the WebSocket URL's, with an http scheme.
  const origin = controlPlaneBase(options.url);
  const createAgent = options.createAgent ?? defaultCreateAgent(origin);
  const callTimeoutMs = options.callTimeoutMs ?? DEFAULT_CALL_TIMEOUT_MS;
  const idleReleaseMs = options.idleReleaseMs ?? DEFAULT_IDLE_RELEASE_MS;
  // What each run has told the control plane, and how far it got, kept until the control plane has
  // the end, so a dropped link or a restart loses nothing.
  const state = openRunDatabase(options.statePath ?? `${options.journalPath}.state`);
  const records = new RunRecords(state);
  const outbox = new RunOutbox(state);
  // Opened once; a run waits for it, and a journal that will not open fails each run clearly. Runs
  // a restart interrupted stay in it for the control plane to ask for again.
  const journal = DurableRuns.open(
    options.journalPath,
    new Set(records.all().flatMap((record) => (record.done ? [] : agentsOf(record)))),
  );
  journal.catch(() => undefined);
  // The sandbox each thread's latest run used; dropped when the thread gives its sandbox up.
  const boxes = new Map<string, ThreadSandbox>();
  let socket: WebSocket | undefined;
  let stopped = false;
  let backoff = RECONNECT_MIN_MS;
  let retry: Timer | undefined;
  const connected = Promise.withResolvers<void>();

  // False when the link is down and the message went nowhere.
  const send = (message: RuntimeToControlPlane) => {
    if (socket?.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(message));
    return true;
  };

  const sendBinary = (frame: Uint8Array) => {
    if (socket?.readyState === WebSocket.OPEN) socket.send(frame);
  };

  // How the desktops and terminals the control plane opens reach it.
  const viewerLink: ViewerLink = {
    send: (message) => void send(message),
    sendBinary,
    buffered: () => socket?.bufferedAmount ?? 0,
  };

  // Streams thread desktops to the viewers the control plane opens (decision 0015).
  const viewers = new DesktopViewers(options.sandbox, viewerLink);

  // Runs the shells of the terminals the control plane opens (decision 0053).
  const terminals = new TerminalSessions(options.sandbox, viewerLink);

  const sendOrWarn = (message: RuntimeToControlPlane) => {
    if (!send(message)) console.warn(`Dropped a ${message.type} message: not connected`);
  };

  const { call, resend, settle } = createControlPlaneCalls({ send, timeoutMs: callTimeoutMs });

  // Tells the control plane something about a run. It is kept either way: if the link is down or
  // the control plane has not asked for the run since it came back, it is sent on request.
  const report: DriverContext["report"] = (runId, make, source) => {
    const message = outbox.push(runId, make, source);
    if (message && outbox.attached(runId)) send(message);
  };

  // Its checks reach the bots and the driver, which are made with it: hence the annotation.
  const idle: IdleRelease = new IdleRelease({
    sandbox: options.sandbox,
    boxes,
    idleMs: idleReleaseMs,
    stopped: () => stopped,
    hasRun: (threadId) =>
      bots.has(threadId) || [...driver.live.values()].some((run) => run.threadId === threadId),
    isWatched: (threadId) => viewers.watching(threadId) > 0 || terminals.count(threadId) > 0,
  });

  // Answers for the bots, each on its own computer (decision 0059).
  const bots = new BotReplies({
    sandbox: options.sandbox,
    createAgent: options.createBotAgent ?? defaultCreateBotAgent(origin),
    send,
    call,
    boxes,
    starting: (threadId) => idle.starting(threadId),
    finished: (threadId) => idle.schedule(threadId),
    pause: options.typingPause,
  });

  const driver = createRunDriver({
    journal,
    records,
    outbox,
    sandbox: options.sandbox,
    createAgent,
    call,
    report,
    boxes,
    controlPlane: origin,
    starting: (threadId) => idle.starting(threadId),
    finished: (threadId) => idle.schedule(threadId),
    stopped: () => stopped,
  });

  // Answers a call of the control plane's with what `work` returns, or with why it failed.
  async function answer(id: string, work: () => Promise<unknown>) {
    try {
      sendOrWarn({ type: "reply", id, ok: true, result: await work() });
    } catch (error) {
      sendOrWarn({ type: "reply", id, ok: false, error: errorMessage(error) });
    }
  }

  const callOf = createRunnerCalls({
    sandbox: options.sandbox,
    boxes,
    viewers,
    idle,
    steer: (params) => driver.steer(params),
  });

  async function handle(message: ControlPlaneToRuntime) {
    switch (message.type) {
      case "run.start":
      case "run.resume":
        void driver.start(message);
        return;
      case "run.cancel":
        await driver.cancel(message.runId, message.reason);
        return;
      case "bot.reply":
        bots.start(message);
        return;
      case "bot.cancel":
        bots.cancel(message.replyId, message.reason);
        return;
      case "run.attach":
        for (const missed of outbox.attach(message.runId, message.after)) send(missed);
        // A run this process had before it restarted goes on from here.
        void driver.restore(message.runId);
        return;
      case "run.ack":
        outbox.ack(message.runId);
        driver.forget(message.runId);
        return;
      case "desktop.open":
        void viewers.open(message.viewerId, message.threadId);
        return;
      case "desktop.close":
        viewers.close(message.viewerId);
        return;
      case "terminal.open":
        terminals.open(message.viewerId, message.threadId, message);
        return;
      case "terminal.resize":
        terminals.resize(message.viewerId, message.cols, message.rows);
        return;
      case "terminal.close":
        terminals.close(message.viewerId);
        return;
      case "call":
        await answer(message.id, () => callOf(message.method, message.params));
        return;
      case "reply":
        settle(message);
        return;
      default:
        // Every type is handled above; a type this runner does not know yet is ignored.
        message satisfies never;
        return;
    }
  }

  // The machine's load goes to the control plane while connected, for Settings to show. It is
  // information only: a failed reading is skipped, never a reason to drop the connection.
  const cpu = cpuSampler();
  const statsEveryMs = options.statsIntervalMs ?? DEFAULT_STATS_INTERVAL_MS;
  let statsTimer: ReturnType<typeof setInterval> | undefined;
  async function reportStats() {
    try {
      const stats = await readHostStats({
        home: dirname(options.journalPath),
        cpu,
        sandboxes: options.sandbox.running?.() ?? 0,
      });
      if (socket?.readyState === WebSocket.OPEN) send({ type: "host.stats", stats });
    } catch {
      // Tried again at the next interval.
    }
  }

  function connect() {
    if (stopped) return;
    // Bun's WebSocket takes request headers, which is how the token travels; the DOM typings
    // here only know the protocols form.
    const init = { headers: { authorization: `Bearer ${options.token}` } };
    const ws = new WebSocket(options.url, init as unknown as string[]);
    ws.binaryType = "arraybuffer";
    socket = ws;
    ws.onopen = () => {
      backoff = RECONNECT_MIN_MS;
      // The control plane asks for each of these runs again, or says to forget it.
      outbox.detachAll();
      send({ type: "hello", version: WIRE_VERSION, runs: outbox.ids(), build: options.build });
      resend();
      connected.resolve();
      clearInterval(statsTimer);
      void reportStats();
      statsTimer = setInterval(() => void reportStats(), statsEveryMs);
    };
    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        const frame = decodeViewerFrame(new Uint8Array(event.data));
        if (!frame) return;
        if (terminals.has(frame.viewerId)) terminals.write(frame.viewerId, frame.payload);
        else viewers.write(frame.viewerId, frame.payload);
        return;
      }
      let message: ControlPlaneToRuntime;
      try {
        message = JSON.parse(String(event.data)) as ControlPlaneToRuntime;
      } catch {
        console.warn("Ignored a frame that is not valid JSON");
        return;
      }
      handle(message).catch((error: unknown) => {
        console.error(`Could not handle a ${message.type} message:`, error);
      });
    };
    ws.onclose = (event) => {
      clearInterval(statsTimer);
      // Runs and calls carry on: the control plane holds them for a while and asks again on return.
      viewers.closeAll();
      terminals.closeAll();
      // A bot's reply is not taken up again after a reconnect: the control plane ends it.
      bots.abortAll("The connection to the control plane dropped");
      if (event.code === CloseCode.UnsupportedVersion || event.code === CloseCode.Revoked) {
        stopped = true;
        options.onRefused?.(event.reason || "Refused by the control plane");
      }
      if (stopped) return;
      retry = setTimeout(connect, backoff);
      backoff = Math.min(backoff * 2, RECONNECT_MAX_MS);
    };
    ws.onerror = () => {
      // `onclose` follows and schedules the reconnect.
    };
  }

  connect();

  return {
    /** Resolves once the first connection is open. */
    ready: connected.promise,
    async stop() {
      stopped = true;
      clearTimeout(retry);
      clearInterval(statsTimer);
      idle.cancelAll();
      viewers.closeAll();
      terminals.closeAll();
      bots.abortAll("The runner is stopping");
      socket?.close();
      await idle.settled();
      await options.sandbox.dispose();
      await journal.then((journaled) => journaled.close()).catch(() => undefined);
      state.close();
    },
  };
}
