import { dirname } from "node:path";

import { createCodingAgent } from "@aven/agents/coding-agent";
import { createCompactionAgent } from "@aven/agents/compaction-agent";
import { subagentInstructions } from "@aven/agents/subagent-instruction";
import { SUBAGENT_MAX_TURNS } from "@aven/agents/subagents";
import { errorMessage } from "@aven/agents/values";
import { WIRE_VERSION, CloseCode } from "@aven/protocol/runtime-wire";
import { decodeViewerFrame } from "@aven/protocol/viewer-frame";

import { BotReplies, defaultCreateBotAgent } from "./bot-replies";
import { createControlPlaneCalls } from "./control-plane-calls";
import { cpuSampler, readHostStats } from "./host-stats";
import { IdleRelease } from "./idle-release";
import { createMachineProcessWatch } from "./machine-process-watch";
import { PortTunnels } from "./port-tunnels";
import { ProcessEndWatch, ProcessWatchRecords } from "./process-end-watch";
import { machineCallWait } from "./machine-call-wait";
import { PlacedWorkspaces } from "./placed-workspaces";
import { RemoteWorkspaces } from "./remote-workspaces";
import { createRunnerCalls } from "./runner-calls";
import { TerminalSessions } from "./terminal-sessions";
import { openAgentBackends } from "./agent-backends";
import { readMachineGithubLogin } from "./github-login";
import { createRunDriver } from "./run-driver";
import { RunOutbox, openRunDatabase } from "./run-outbox";
import { RunRecords, agentsOf } from "./run-records";
import type { ControlPlaneToRuntime, RuntimeToControlPlane } from "@aven/protocol/types";
import type {
  CreateRuntimeAgent,
  DriverContext,
  RuntimeOptions,
  ThreadSandbox,
  ViewerLink,
} from "./types";

export const defaultCreateAgent =
  (origin: string): CreateRuntimeAgent =>
  ({
    id,
    attended,
    tools,
    skills,
    skillsUnavailable,
    envNames,
    paths,
    mcp,
    memory,
    webSearch,
    forks,
    model,
    role,
    compact,
  }) => {
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
      skillsUnavailable,
      envNames,
      paths,
      mcp,
      memory,
      webSearch,
      forks,
    });
  };

const DEFAULT_STATS_INTERVAL_MS = 15_000;
const RECONNECT_MIN_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
const DEFAULT_CALL_TIMEOUT_MS = 60_000;
const DEFAULT_IDLE_RELEASE_MS = 30 * 60_000;

export function controlPlaneBase(connectUrl: string) {
  const url = new URL(connectUrl.replace(/^ws/, "http"));
  const prefix = /^(.*)\/runtimes\/connect\/?$/.exec(url.pathname)?.[1] ?? "";
  return `${url.origin}${prefix}`;
}

export function startRuntime(options: RuntimeOptions) {
  const origin = controlPlaneBase(options.url);
  const createAgent = options.createAgent ?? defaultCreateAgent(origin);
  const callTimeoutMs = options.callTimeoutMs ?? DEFAULT_CALL_TIMEOUT_MS;
  const idleReleaseMs = options.idleReleaseMs ?? DEFAULT_IDLE_RELEASE_MS;
  const state = openRunDatabase(options.statePath ?? `${options.journalPath}.state`);
  const records = new RunRecords(state);
  const outbox = new RunOutbox(state);
  const backends = openAgentBackends(
    options.journalPath,
    new Set(records.all().flatMap((record) => (record.done ? [] : agentsOf(record)))),
  );
  const githubLogin = options.githubLogin ?? (options.host ? readMachineGithubLogin : undefined);
  const boxes = new Map<string, ThreadSandbox>();
  let socket: WebSocket | undefined;
  let stopped = false;
  let backoff = RECONNECT_MIN_MS;
  let retry: Timer | undefined;
  const connected = Promise.withResolvers<void>();

  const send = (message: RuntimeToControlPlane) => {
    if (socket?.readyState !== WebSocket.OPEN) return false;

    socket.send(JSON.stringify(message));
    return true;
  };

  const sendBinary = (frame: Uint8Array<ArrayBuffer>) => {
    if (socket?.readyState === WebSocket.OPEN) socket.send(frame);
  };

  const viewerLink: ViewerLink = {
    send: (message) => void send(message),
    sendBinary,
    buffered: () => socket?.bufferedAmount ?? 0,
  };

  const terminals = new TerminalSessions(options.sandbox, viewerLink);
  const ports = new PortTunnels(viewerLink);

  const sendOrWarn = (message: RuntimeToControlPlane) => {
    if (!send(message)) console.warn(`Dropped a ${message.type} message: not connected`);
  };

  const { call, resend, settle } = createControlPlaneCalls({ send, timeoutMs: callTimeoutMs });

  const report: DriverContext["report"] = (runId, make, source) => {
    const message = outbox.push(runId, make, source);

    if (message && outbox.attached(runId)) send(message);
  };

  const idle: IdleRelease = new IdleRelease({
    sandbox: options.sandbox,
    boxes,
    idleMs: idleReleaseMs,
    stopped: () => stopped,
    hasRun: (threadId) =>
      bots.has(threadId) || [...driver.live.values()].some((run) => run.threadId === threadId),
    isWatched: (threadId) => terminals.count(threadId) > 0,
  });

  const guestRuns = new Set<string>();
  const processEnds = new ProcessEndWatch(
    {
      box: (threadId) => boxes.get(threadId),
      send,
      hasRun: (threadId) =>
        guestRuns.has(threadId) ||
        [...driver.live.values()].some((run) => run.threadId === threadId),
      stopped: () => stopped,
      pollMs: options.processPollMs,
    },
    new ProcessWatchRecords(state),
  );
  const machineProcesses = createMachineProcessWatch(processEnds, guestRuns);

  const botMachines = new RemoteWorkspaces((botId) => (op, args) => {
    const replyId = bots.replyOnMachine(botId);

    if (!replyId) return Promise.reject(new Error("The computer is reached only during a reply"));

    return call("machine.call", { replyId, op, args }, machineCallWait(args));
  });

  const bots: BotReplies = new BotReplies({
    sandbox: options.sandbox,
    machines: botMachines,
    machineCall: (botId) => botMachines.call(botId),
    createAgent: options.createBotAgent ?? defaultCreateBotAgent(origin),
    send,
    call,
    boxes,
    starting: (threadId) => idle.starting(threadId),
    finished: (threadId) => idle.schedule(threadId),
    pause: options.typingPause,
  });

  const runOnMachine = (threadId: string) =>
    [...driver.live].find(([, run]) => run.threadId === threadId && run.machine)?.[0];
  const machines = new RemoteWorkspaces((threadId) => (op, args) => {
    const runId = runOnMachine(threadId);

    if (!runId) return Promise.reject(new Error("The computer is reached only during a run"));

    return call("machine.call", { runId, op, args }, machineCallWait(args));
  });
  const placed = new PlacedWorkspaces(options.sandbox, machines, (threadId) =>
    Boolean(runOnMachine(threadId)),
  );

  const driver = createRunDriver({
    backend: (kind) => backends.get(kind),
    machineCall: (threadId) => machines.call(threadId),
    records,
    outbox,
    sandbox: placed,
    createAgent,
    call,
    report,
    boxes,
    controlPlane: origin,
    starting: (threadId) => {
      if (!runOnMachine(threadId)) processEnds.arm(threadId);

      return idle.starting(threadId);
    },
    finished: (threadId, ended) => {
      idle.schedule(threadId);

      if (ended === "response") processEnds.settle(threadId);
      else processEnds.suspend(threadId);
    },
    stopped: () => stopped,
  });

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
    idle,
    processEnds,
    machineProcesses,
    update: options.update && {
      start: options.update,
      busy: () =>
        driver.live.size > 0 || bots.count > 0
          ? "A run is going on this runner. Try again when it has finished."
          : undefined,
    },
    steer: (params) => driver.steer(params),
    dirs: options.dirs,
    clone: options.clone,
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
        void driver.restore(message.runId, message.secrets);
        return;
      case "run.ack":
        outbox.ack(message.runId);
        driver.forget(message.runId);
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
      case "port.open":
        void ports.open(message.viewerId, message.port);
        return;
      case "port.close":
        ports.close(message.viewerId);
        return;
      case "call":
        await answer(message.id, () => callOf(message.method, message.params));
        return;
      case "reply":
        settle(message);
        return;
      default:
        message satisfies never;
    }
  }

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
    } catch {}
  }

  function connect() {
    if (stopped) return;

    const init = { headers: { authorization: `Bearer ${options.token}` } };
    const ws = new WebSocket(options.url, init as unknown as string[]);
    ws.binaryType = "arraybuffer";
    socket = ws;
    ws.onopen = async () => {
      backoff = RECONNECT_MIN_MS;
      outbox.detachAll();
      const login = githubLogin ? await githubLogin().catch(() => null) : undefined;
      send({
        type: "hello",
        version: WIRE_VERSION,
        runs: outbox.ids(),
        build: options.build,
        canUpdate: options.update ? true : undefined,
        host: options.host ? true : undefined,
        dirs: options.dirs?.length ? options.dirs : undefined,
        backends: [...backends.offered],
        guests: guestRuns.size ? [...guestRuns] : undefined,
        github: login === undefined ? undefined : { login },
      });
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
        else if (ports.has(frame.viewerId)) ports.write(frame.viewerId, frame.payload);

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
      terminals.closeAll();
      ports.closeAll();
      bots.abortAll("The connection to the control plane dropped");

      if (event.code === CloseCode.UnsupportedVersion || event.code === CloseCode.Revoked) {
        stopped = true;
        options.onRefused?.(event.reason || "Refused by the control plane");
      }

      if (stopped) return;

      retry = setTimeout(connect, backoff);
      backoff = Math.min(backoff * 2, RECONNECT_MAX_MS);
    };
    ws.onerror = () => {};
  }

  connect();

  return {
    ready: connected.promise,
    async stop() {
      stopped = true;
      clearTimeout(retry);
      clearInterval(statsTimer);
      idle.cancelAll();
      processEnds.cancelAll();
      terminals.closeAll();
      ports.closeAll();
      bots.abortAll("The runner is stopping");
      socket?.close();
      await idle.settled();
      await options.sandbox.dispose();
      await backends.close();
      state.close();
    },
  };
}
