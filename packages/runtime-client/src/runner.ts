import type { MemoryStore } from "@anvia/core";
import { createCodingAgent, type CodingAgent } from "@aven/agents/coding-agent";
import { formatJobNotice, JobRegistry } from "@aven/agents/jobs/job-registry";
import { projectStreamEvent } from "@aven/agents/projection";
import { handleFsCall, WorkspaceError } from "@aven/agents/workspace";
import {
  WIRE_VERSION,
  type ControlPlaneToRuntime,
  type MemoryCallMethod,
  type RunModel,
  type RunThreadInfo,
  type RuntimeToControlPlane,
} from "@aven/protocol/runtime-wire";

import { createRemoteMemory } from "./remote-memory";

export type CreateRuntimeAgent = (input: {
  thread: RunThreadInfo;
  jobs: JobRegistry;
  memory: MemoryStore;
  model?: RunModel;
}) => { agent: Pick<CodingAgent, "stream"> };

// Builds the agent for a run. The model is reached through the control plane's gateway with the
// run's token; this process never holds a provider key.
const defaultCreateAgent =
  (origin: string): CreateRuntimeAgent =>
  ({ thread, jobs, memory, model }) => {
    if (!model) throw new Error("The control plane sent no model for this run");
    return createCodingAgent({
      provider: model.provider,
      modelId: model.modelId,
      apiKey: model.gatewayToken,
      baseUrl: `${origin}${model.gatewayPath}`,
      reasoningEffort: model.reasoningEffort,
      effortLevels: model.effortLevels,
      root: thread.projectPath,
      jobs,
      memory,
    });
  };

type LiveRun = { stream: ReturnType<CodingAgent["stream"]> };

export type RuntimeOptions = {
  /** The control plane's WebSocket URL, e.g. ws://localhost:8000/runtimes/connect. */
  url: string;
  /** The registration token shown once when the runtime was created. */
  token: string;
  createAgent?: CreateRuntimeAgent;
  /** Answers the control plane's filesystem calls; defaults to this machine's disk. */
  onCall?: (method: string, params: unknown) => Promise<unknown>;
};

const RECONNECT_MIN_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

// Connects out to the control plane and runs whatever it is told to, until stopped. Reconnects
// with backoff; runs in flight when the link drops are abandoned (the control plane ends them).
export function startRuntime(options: RuntimeOptions) {
  // The control plane's own origin, for its model gateway: the WebSocket URL with an http scheme.
  const origin = new URL(options.url.replace(/^ws/, "http")).origin;
  const createAgent = options.createAgent ?? defaultCreateAgent(origin);
  const runs = new Map<string, LiveRun>();
  const jobs = new Map<string, JobRegistry>();
  const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  let socket: WebSocket | undefined;
  let stopped = false;
  let backoff = RECONNECT_MIN_MS;
  let retry: Timer | undefined;
  let connected: (() => void) | undefined;
  const ready = new Promise<void>((resolve) => {
    connected = resolve;
  });

  const send = (message: RuntimeToControlPlane) => {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  };

  const call = (method: MemoryCallMethod, params: unknown) =>
    new Promise<unknown>((resolve, reject) => {
      if (socket?.readyState !== WebSocket.OPEN) {
        reject(new Error("Not connected to the control plane"));
        return;
      }
      const id = crypto.randomUUID();
      pending.set(id, { resolve, reject });
      send({ type: "call", id, method, params });
    });

  const jobsFor = (threadId: string) => {
    let registry = jobs.get(threadId);
    if (registry) return registry;
    registry = new JobRegistry();
    registry.onComplete((job) => {
      // A killed job was stopped on purpose: nothing to report.
      if (!job.background || job.status === "killed" || stopped) return;
      send({ type: "job.notice", threadId, notice: formatJobNotice(job) });
    });
    jobs.set(threadId, registry);
    return registry;
  };

  async function runAgent(message: Extract<ControlPlaneToRuntime, { type: "run.start" }>) {
    const { runId, thread, prompt, model } = message;
    try {
      const { agent } = createAgent({
        thread,
        jobs: jobsFor(thread.id),
        memory: createRemoteMemory(call, runId),
        model,
      });
      const stream = agent.stream({
        prompt,
        session: { sessionId: thread.id, metadata: { organizationId: thread.organizationId } },
      });
      runs.set(runId, { stream });
      for await (const event of stream) {
        const projected = projectStreamEvent(event);
        if (projected) send({ type: "run.event", runId, event: projected });
      }
      const outcome = await stream.result;
      send({ type: "run.end", runId, outcome: outcome.type });
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      send({ type: "run.end", runId, outcome: "error", error: text });
    } finally {
      runs.delete(runId);
    }
  }

  async function handle(message: ControlPlaneToRuntime) {
    switch (message.type) {
      case "run.start":
        void runAgent(message);
        return;
      case "run.cancel":
        runs.get(message.runId)?.stream.cancel(message.reason);
        return;
      case "run.steer":
        try {
          runs.get(message.runId)?.stream.steer({ prompt: message.prompt });
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
      case "call": {
        try {
          const result = await (options.onCall ?? handleFsCall)(message.method, message.params);
          send({ type: "reply", id: message.id, ok: true, result });
        } catch (error) {
          const text = error instanceof Error ? error.message : String(error);
          const code = error instanceof WorkspaceError ? error.code : undefined;
          send({ type: "reply", id: message.id, ok: false, error: text, code });
        }
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
      connected?.();
    };
    ws.onmessage = (event) => {
      try {
        void handle(JSON.parse(String(event.data)) as ControlPlaneToRuntime);
      } catch {
        // Ignore frames that are not valid JSON.
      }
    };
    ws.onclose = () => {
      for (const [, waiting] of pending) waiting.reject(new Error("Disconnected"));
      pending.clear();
      for (const [, run] of runs) run.stream.cancel("Disconnected from the control plane");
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
    ready,
    async stop() {
      stopped = true;
      clearTimeout(retry);
      socket?.close();
      await Promise.all([...jobs.values()].map((registry) => registry.disposeAll()));
    },
  };
}
