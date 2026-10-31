import { createCodingAgent } from "@aven/agents/coding-agent";
import { errorMessage } from "@aven/agents/values";
import {
  WIRE_VERSION,
  decodeViewerFrame,
  CloseCode,
  type ControlPlaneToRuntime,
  type CallMethod,
  type FilesCallMethod,
  type RunnerCallMethod,
  type RuntimeCalls,
  type RuntimeToControlPlane,
} from "@aven/protocol/runtime-wire";

import {
  artifactsReadParams,
  desktopCallParams,
  diffGetParams,
  filesCallParams,
  filesSearchParams,
} from "./call-params";
import { DesktopViewers } from "./desktop-viewers";
import { TerminalSessions } from "./terminal-sessions";
import { threadDiff } from "./thread-diff";
import { listDirectory, readWorkspaceFile, searchWorkspace } from "./workspace-files";
import { DurableRuns } from "./durable-runs";
import { createRunDriver, type CreateRuntimeAgent, type DriverContext } from "./run-driver";
import { RunOutbox, openRunDatabase } from "./run-outbox";
import { RunRecords, agentsOf } from "./run-records";
import type { ThreadSandbox, ThreadWorkspaces } from "./sandbox";

// Builds the agent for a run. The model is reached through the control plane's gateway with the
// run's token; this process never holds a provider key. The conversation is durable's own, so the
// agent has no memory store.
const defaultCreateAgent =
  (origin: string): CreateRuntimeAgent =>
  ({ id, attended, tools, skills, envNames, model }) => {
    if (!model) throw new Error("The control plane sent no model for this run");
    return createCodingAgent({
      id,
      questions: attended,
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
    });
  };

export type RuntimeOptions = {
  /** The control plane's WebSocket URL, e.g. ws://localhost:8000/runtimes/connect. */
  url: string;
  /** The registration token shown once when the runtime was created. */
  token: string;
  createAgent?: CreateRuntimeAgent;
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
   * stay). Default 15 minutes.
   */
  idleReleaseMs?: number;
};

const RECONNECT_MIN_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
// About as long as the control plane holds a run for its runtime to come back.
const DEFAULT_CALL_TIMEOUT_MS = 60_000;
const DEFAULT_IDLE_RELEASE_MS = 15 * 60_000;

// Connects out to the control plane and runs whatever it is told to, until stopped. Reconnects
// with backoff; runs in flight when the link drops are abandoned (the control plane ends them).
export function startRuntime(options: RuntimeOptions) {
  // The control plane's own origin, for its model gateway: the WebSocket URL with an http scheme.
  const origin = new URL(options.url.replace(/^ws/, "http")).origin;
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
  const idleTimers = new Map<string, Timer>();
  const releasing = new Map<string, Promise<void>>();
  // Calls waiting for an answer. One sent over a connection that dropped is sent again on the next.
  const pending = new Map<
    string,
    {
      method: CallMethod;
      params: unknown;
      resolve: (v: unknown) => void;
      reject: (e: Error) => void;
    }
  >();
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

  // Streams thread desktops to the viewers the control plane opens (decision 0015).
  const viewers = new DesktopViewers(options.sandbox, {
    send: (message) => void send(message),
    sendBinary,
    buffered: () => socket?.bufferedAmount ?? 0,
  });

  // Runs the shells of the terminals the control plane opens (decision 0053).
  const terminals = new TerminalSessions(options.sandbox, {
    send: (message) => void send(message),
    sendBinary,
    buffered: () => socket?.bufferedAmount ?? 0,
  });

  const sendOrWarn = (message: RuntimeToControlPlane) => {
    if (!send(message)) console.warn(`Dropped a ${message.type} message: not connected`);
  };

  const call = <M extends keyof RuntimeCalls>(method: M, params: RuntimeCalls[M]["params"]) =>
    new Promise<RuntimeCalls[M]["result"]>((resolve, reject) => {
      const id = crypto.randomUUID();
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`The control plane did not answer ${method} within ${callTimeoutMs} ms`));
      }, callTimeoutMs);
      pending.set(id, {
        method,
        params,
        // The control plane's answer is taken to be what the method returns; it is not checked.
        resolve: (value) => (clearTimeout(timer), resolve(value as RuntimeCalls[M]["result"])),
        reject: (error) => (clearTimeout(timer), reject(error)),
      });
      // Sent now if the link is up, and again whenever it comes back until it is answered.
      send({ type: "call", id, method, params });
    });

  // Tells the control plane something about a run. It is kept either way: if the link is down or
  // the control plane has not asked for the run since it came back, it is sent on request.
  const report: DriverContext["report"] = (runId, make, source) => {
    const message = outbox.push(runId, make, source);
    if (message && outbox.attached(runId)) send(message);
  };

  function scheduleIdleRelease(threadId: string) {
    clearTimeout(idleTimers.get(threadId));
    if (stopped) return;
    idleTimers.set(
      threadId,
      setTimeout(() => void releaseIfIdle(threadId), idleReleaseMs),
    );
  }

  const hasRun = (threadId: string) =>
    [...driver.live.values()].some((run) => run.threadId === threadId);

  // A run, or a process the agent left running (a dev server), keeps the sandbox; the check comes
  // round again after another idle period.
  async function releaseIfIdle(threadId: string) {
    idleTimers.delete(threadId);
    if (stopped || hasRun(threadId)) return;
    const busy =
      viewers.watching(threadId) > 0 ||
      terminals.count(threadId) > 0 ||
      (await boxes
        .get(threadId)
        ?.hasRunningProcesses()
        .catch(() => false));
    if (stopped || hasRun(threadId)) return;
    if (busy) {
      scheduleIdleRelease(threadId);
      return;
    }
    const release = freeThread(threadId)
      .catch((error: unknown) => console.error(`Could not release thread ${threadId}:`, error))
      .finally(() => releasing.delete(threadId));
    releasing.set(threadId, release);
  }

  async function freeThread(threadId: string) {
    boxes.delete(threadId);
    await options.sandbox.release(threadId);
  }

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
    async starting(threadId) {
      clearTimeout(idleTimers.get(threadId));
      await releasing.get(threadId);
    },
    finished: scheduleIdleRelease,
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

  // A thread's changes; null when it has no workspace on this runner yet.
  async function diffOf(params: unknown) {
    const { threadId, scope } = diffGetParams(params);
    const root = await options.sandbox.workspace(threadId);
    return root ? threadDiff(root, scope) : null;
  }

  // A folder or a file of a thread's workspace; null when it has no workspace on this runner yet.
  async function filesOf(method: Exclude<FilesCallMethod, "files.search">, params: unknown) {
    const { threadId, path } = filesCallParams(params);
    const root = await options.sandbox.workspace(threadId);
    if (!root) return null;
    return method === "files.list"
      ? { entries: await listDirectory(root, path) }
      : readWorkspaceFile(root, path);
  }

  // The files of a thread's workspace that match the composer's `@`; null without a workspace.
  async function searchOf(params: unknown) {
    const { threadId, query } = filesSearchParams(params);
    const root = await options.sandbox.workspace(threadId);
    return root ? { paths: await searchWorkspace(root, query) } : null;
  }

  // An image the thread's agent showed; null when this runner does not have it. Read from the
  // runner's own disk, so it does not need the thread's sandbox to be running (decision 0033).
  async function artifactOf(params: unknown) {
    const { threadId, name } = artifactsReadParams(params);
    return (await options.sandbox.artifacts?.read(threadId, name)) ?? null;
  }

  // Starts a thread's sandbox without a run, for a person who wants its desktop (decision 0039); the
  // idle clock frees it again if nothing uses it. A thread that never ran has no workspace to
  // start it on, and the clone is made by a run.
  async function wakeOf(params: unknown) {
    const { threadId } = desktopCallParams(params);
    clearTimeout(idleTimers.get(threadId));
    await releasing.get(threadId);
    const box = await options.sandbox.acquire({ id: threadId }, async () => {
      throw new Error("The thread has no workspace yet");
    });
    boxes.set(threadId, box);
    scheduleIdleRelease(threadId);
    return viewers.call("desktop.status", { threadId });
  }

  // What the control plane's call asks for: a thread's changes, its files, an image, or its desktop.
  function callOf(method: RunnerCallMethod, params: unknown) {
    if (method === "desktop.wake") return wakeOf(params);
    if (method === "diff.get") return diffOf(params);
    if (method === "artifacts.read") return artifactOf(params);
    if (method === "files.list" || method === "files.read") return filesOf(method, params);
    if (method === "files.search") return searchOf(params);
    return viewers.call(method, params);
  }

  async function handle(message: ControlPlaneToRuntime) {
    switch (message.type) {
      case "run.start":
      case "run.resume":
        void driver.start(message);
        return;
      case "run.cancel":
        await driver.cancel(message.runId, message.reason);
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
      case "reply": {
        const waiting = pending.get(message.id);
        if (!waiting) return;
        pending.delete(message.id);
        if (message.ok) waiting.resolve(message.result);
        else waiting.reject(new Error(message.error ?? "The control plane reported an error"));
        return;
      }
      default:
        // Every type is handled above; a type this runner does not know yet is ignored.
        message satisfies never;
        return;
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
      send({ type: "hello", version: WIRE_VERSION, runs: outbox.ids() });
      for (const [id, waiting] of pending)
        send({ type: "call", id, method: waiting.method, params: waiting.params });
      connected.resolve();
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
      // Runs and calls carry on: the control plane holds them for a while and asks again on return.
      viewers.closeAll();
      terminals.closeAll();
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
      for (const timer of idleTimers.values()) clearTimeout(timer);
      viewers.closeAll();
      terminals.closeAll();
      socket?.close();
      await Promise.all(releasing.values());
      await options.sandbox.dispose();
      await journal.then((journaled) => journaled.close()).catch(() => undefined);
      state.close();
    },
  };
}
