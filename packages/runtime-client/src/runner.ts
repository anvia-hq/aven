import type { AnyTool, MemoryStore } from "@anvia/core";
import { createCodingAgent, type CodingAgent } from "@aven/agents/coding-agent";
import { formatJobNotice, JobRegistry, type Launcher } from "@aven/agents/jobs/job-registry";
import { projectStreamEvent } from "@aven/agents/projection";
import {
  WIRE_VERSION,
  type ControlPlaneToRuntime,
  type MemoryCallMethod,
  type RunModel,
  type RunThreadInfo,
  type RuntimeToControlPlane,
} from "@aven/protocol/runtime-wire";

import { createRemoteMemory } from "./remote-memory";
import type { ThreadWorkspaces } from "./sandbox";

export type CreateRuntimeAgent = (input: {
  thread: RunThreadInfo;
  /** The thread's workspace on this machine; the file tools are confined to it. */
  root: string;
  jobs: JobRegistry;
  memory: MemoryStore;
  model?: RunModel;
  /** Extra tools from the thread's sandbox: a desktop the agent can see and drive. */
  extraTools?: readonly AnyTool[];
}) => { agent: Pick<CodingAgent, "stream"> };

// Builds the agent for a run. The model is reached through the control plane's gateway with the
// run's token; this process never holds a provider key.
const defaultCreateAgent =
  (origin: string): CreateRuntimeAgent =>
  ({ root, jobs, memory, model, extraTools }) => {
    if (!model) throw new Error("The control plane sent no model for this run");
    return createCodingAgent({
      provider: model.provider,
      modelId: model.modelId,
      apiKey: model.gatewayToken,
      baseUrl: `${origin}${model.gatewayPath}`,
      reasoningEffort: model.reasoningEffort,
      effortLevels: model.effortLevels,
      root,
      jobs,
      memory,
      extraTools,
    });
  };

type LiveRun = {
  threadId: string;
  /** Not there until the thread's sandbox is up and the agent has started. */
  stream?: ReturnType<CodingAgent["stream"]>;
  /** A cancel that arrived before there was a stream to cancel. */
  cancelReason?: string;
};

function cancelRun(run: LiveRun, reason: string) {
  if (run.stream) run.stream.cancel(reason);
  else run.cancelReason = reason;
}

export type RuntimeOptions = {
  /** The control plane's WebSocket URL, e.g. ws://localhost:8000/runtimes/connect. */
  url: string;
  /** The registration token shown once when the runtime was created. */
  token: string;
  createAgent?: CreateRuntimeAgent;
  /** Gives each thread its sandbox and workspace (decision 0010). */
  sandbox: ThreadWorkspaces;
  /**
   * The control plane refused this runtime for good (revoked, token rotated, or an incompatible
   * version), so reconnecting would not help. `reason` says why.
   */
  onRefused?: (reason: string) => void;
  /** How long to wait for the control plane to answer a memory call. Default 30 seconds. */
  callTimeoutMs?: number;
  /**
   * A thread with no run and no running command for this long gives up its sandbox (its files
   * stay). Default 15 minutes.
   */
  idleReleaseMs?: number;
};

const RECONNECT_MIN_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
const DEFAULT_CALL_TIMEOUT_MS = 30_000;
const DEFAULT_IDLE_RELEASE_MS = 15 * 60_000;

// Connects out to the control plane and runs whatever it is told to, until stopped. Reconnects
// with backoff; runs in flight when the link drops are abandoned (the control plane ends them).
export function startRuntime(options: RuntimeOptions) {
  // The control plane's own origin, for its model gateway: the WebSocket URL with an http scheme.
  const origin = new URL(options.url.replace(/^ws/, "http")).origin;
  const createAgent = options.createAgent ?? defaultCreateAgent(origin);
  const callTimeoutMs = options.callTimeoutMs ?? DEFAULT_CALL_TIMEOUT_MS;
  const idleReleaseMs = options.idleReleaseMs ?? DEFAULT_IDLE_RELEASE_MS;
  const runs = new Map<string, LiveRun>();
  const jobs = new Map<string, JobRegistry>();
  // Where each thread's commands run now; a registry outlives restarts of the container.
  const launchers = new Map<string, Launcher>();
  const idleTimers = new Map<string, Timer>();
  const releasing = new Map<string, Promise<void>>();
  const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
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

  const sendOrWarn = (message: RuntimeToControlPlane) => {
    if (!send(message)) console.warn(`Dropped a ${message.type} message: not connected`);
  };

  const call = (method: MemoryCallMethod, params: unknown) =>
    new Promise<unknown>((resolve, reject) => {
      const id = crypto.randomUUID();
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`The control plane did not answer ${method} within ${callTimeoutMs} ms`));
      }, callTimeoutMs);
      pending.set(id, {
        resolve: (value) => (clearTimeout(timer), resolve(value)),
        reject: (error) => (clearTimeout(timer), reject(error)),
      });
      if (send({ type: "call", id, method, params })) return;
      pending.get(id)?.reject(new Error("Not connected to the control plane"));
      pending.delete(id);
    });

  const jobsFor = (threadId: string) => {
    let registry = jobs.get(threadId);
    if (registry) return registry;
    registry = new JobRegistry({
      launcher: (input) => {
        const launch = launchers.get(threadId);
        if (!launch) throw new Error("This thread's sandbox is gone");
        return launch(input);
      },
    });
    registry.onComplete((job) => {
      // Not for the jobs killed while this thread's registry is being released.
      if (jobs.get(threadId) === registry) scheduleIdleRelease(threadId);
      // A killed job was stopped on purpose: nothing to report.
      if (!job.background || job.status === "killed" || stopped) return;
      sendOrWarn({ type: "job.notice", threadId, notice: formatJobNotice(job) });
    });
    jobs.set(threadId, registry);
    return registry;
  };

  function scheduleIdleRelease(threadId: string) {
    clearTimeout(idleTimers.get(threadId));
    if (stopped) return;
    idleTimers.set(
      threadId,
      setTimeout(() => releaseIfIdle(threadId), idleReleaseMs),
    );
  }

  function releaseIfIdle(threadId: string) {
    idleTimers.delete(threadId);
    const registry = jobs.get(threadId);
    const hasRun = [...runs.values()].some((run) => run.threadId === threadId);
    const hasJob = registry?.list().some((job) => job.status === "running");
    // A run or command that ends later schedules the release again.
    if (stopped || hasRun || hasJob) return;
    const release = freeThread(threadId, registry)
      .catch((error: unknown) => console.error(`Could not release thread ${threadId}:`, error))
      .finally(() => releasing.delete(threadId));
    releasing.set(threadId, release);
  }

  async function freeThread(threadId: string, registry: JobRegistry | undefined) {
    jobs.delete(threadId);
    launchers.delete(threadId);
    await registry?.disposeAll();
    await options.sandbox.release(threadId);
  }

  async function runAgent(message: Extract<ControlPlaneToRuntime, { type: "run.start" }>) {
    const { runId, thread, prompt, model } = message;
    // Registered before the sandbox is awaited, so a cancel in that window is not lost.
    const live: LiveRun = { threadId: thread.id };
    runs.set(runId, live);
    clearTimeout(idleTimers.get(thread.id));
    try {
      await releasing.get(thread.id);
      // Starts the thread's container on first use; a failure ends the run with a clear error.
      const box = await options.sandbox.acquire(thread);
      if (live.cancelReason) throw new Error(live.cancelReason);
      launchers.set(thread.id, box.launcher);
      const { agent } = createAgent({
        thread,
        root: box.root,
        jobs: jobsFor(thread.id),
        extraTools: box.tools,
        memory: createRemoteMemory(call, runId),
        model,
      });
      const stream = agent.stream({
        prompt,
        session: { sessionId: thread.id, metadata: { organizationId: thread.organizationId } },
      });
      live.stream = stream;
      for await (const event of stream) {
        const projected = projectStreamEvent(event);
        if (projected) send({ type: "run.event", runId, event: projected });
      }
      const outcome = await stream.result;
      sendOrWarn({ type: "run.end", runId, outcome: outcome.type });
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      sendOrWarn({ type: "run.end", runId, outcome: "error", error: text });
    } finally {
      runs.delete(runId);
      scheduleIdleRelease(thread.id);
    }
  }

  async function handle(message: ControlPlaneToRuntime) {
    switch (message.type) {
      case "run.start":
        void runAgent(message);
        return;
      case "run.cancel": {
        const run = runs.get(message.runId);
        if (run) cancelRun(run, message.reason);
        return;
      }
      case "run.steer":
        try {
          runs.get(message.runId)?.stream?.steer({ prompt: message.prompt });
        } catch {
          // The run just ended; the control plane starts a new one if it still matters.
        }
        return;
      case "jobs.stop": {
        const registry = jobs.get(message.threadId);
        for (const job of registry?.list() ?? []) {
          if (job.status === "running") void registry?.kill(job.id);
        }
        return;
      }
      case "reply": {
        const waiting = pending.get(message.id);
        if (!waiting) return;
        pending.delete(message.id);
        if (message.ok) waiting.resolve(message.result);
        else waiting.reject(new Error(message.error ?? "The control plane reported an error"));
        return;
      }
    }
  }

  function connect() {
    if (stopped) return;
    // Bun's WebSocket takes request headers, which is how the token travels; the DOM typings
    // here only know the protocols form.
    const init = { headers: { authorization: `Bearer ${options.token}` } };
    const ws = new WebSocket(options.url, init as unknown as string[]);
    socket = ws;
    ws.onopen = () => {
      backoff = RECONNECT_MIN_MS;
      send({ type: "hello", version: WIRE_VERSION });
      connected.resolve();
    };
    ws.onmessage = (event) => {
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
      for (const [, waiting] of pending) waiting.reject(new Error("Disconnected"));
      pending.clear();
      for (const run of runs.values()) cancelRun(run, "Disconnected from the control plane");
      if (event.code === 4000 || event.code === 4002) {
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
      socket?.close();
      await Promise.all([...jobs.values()].map((registry) => registry.disposeAll()));
      await Promise.all(releasing.values());
      await options.sandbox.dispose();
    },
  };
}
