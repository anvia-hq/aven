import type { Agent, AnyTool, Message } from "@anvia/core";
import {
  parseAgentContinuation,
  parseAgentInteractionResponse,
} from "@anvia/core/agent/interactions";
import type { DurableAgentRegistration } from "@anvia/durable";
import { createCodingAgent } from "@aven/agents/coding-agent";
import { createDefineGoalTool, type GoalRequest } from "@aven/agents/tools/define-goal";
import type { RunEvent } from "@aven/protocol/events";
import {
  WIRE_VERSION,
  decodeViewerFrame,
  type ControlPlaneToRuntime,
  type CallMethod,
  type MemoryAppendParams,
  type RepoAccess,
  type RunModel,
  type RunThreadInfo,
  type RuntimeToControlPlane,
} from "@aven/protocol/runtime-wire";

import { DesktopViewers } from "./desktop-viewers";
import { DurableRuns, type FollowedRun, type RunInput } from "./durable-runs";
import { verifyWith } from "./goal-assessment";
import { goalReport } from "./goal-report";
import { lateBoundTools } from "./late-bound-tools";
import type { ThreadSandbox, ThreadWorkspaces } from "./sandbox";

export type CreateRuntimeAgent = (input: {
  thread: RunThreadInfo;
  /** The agent's id: durable registers one agent per run. */
  id: string;
  /** Whether a person is there to answer: only then may the agent ask a question. */
  attended: boolean;
  /** What the agent can do in the thread's sandbox: files, commands, processes and a desktop. */
  tools: readonly AnyTool[];
  model?: RunModel;
}) => { agent: Agent<unknown>; compaction?: DurableAgentRegistration["compaction"] };

// Builds the agent for a run. The model is reached through the control plane's gateway with the
// run's token; this process never holds a provider key. The conversation is durable's own, so the
// agent has no memory store.
const defaultCreateAgent =
  (origin: string): CreateRuntimeAgent =>
  ({ id, attended, tools, model }) => {
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
    });
  };

type LiveRun = {
  threadId: string;
  /** Not there until the thread's sandbox is up and the run is in the journal; a goal's, while it works. */
  followed?: Pick<FollowedRun, "cancel">;
  /** Why the run was cancelled, also when the cancel arrived before there was a run to cancel. */
  cancelReason?: string;
};

function cancelRun(run: LiveRun, reason: string) {
  run.cancelReason = reason;
  void run.followed?.cancel();
}

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
  /**
   * The control plane refused this runtime for good (revoked, token rotated, or an incompatible
   * version), so reconnecting would not help. `reason` says why.
   */
  onRefused?: (reason: string) => void;
  /** How long to wait for the control plane to answer a memory call. Default 30 seconds. */
  callTimeoutMs?: number;
  /**
   * A thread with no run and no running process for this long gives up its sandbox (its files
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
  // The goal a thread's agent handed over this run, started once its turn ends.
  const goals = new Map<string, GoalRequest>();
  // Opened once; a run waits for it, and a journal that will not open fails each run clearly.
  const journal = DurableRuns.open(options.journalPath);
  journal.catch(() => undefined);
  // The sandbox each thread's latest run used; dropped when the thread gives its sandbox up.
  const boxes = new Map<string, ThreadSandbox>();
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

  const sendBinary = (frame: Uint8Array) => {
    if (socket?.readyState === WebSocket.OPEN) socket.send(frame);
  };

  // Streams thread desktops to the viewers the control plane opens (decision 0015).
  const viewers = new DesktopViewers(options.sandbox, {
    send: (message) => void send(message),
    sendBinary,
    buffered: () => socket?.bufferedAmount ?? 0,
  });

  const sendOrWarn = (message: RuntimeToControlPlane) => {
    if (!send(message)) console.warn(`Dropped a ${message.type} message: not connected`);
  };

  const call = (method: CallMethod, params: unknown) =>
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

  function scheduleIdleRelease(threadId: string) {
    clearTimeout(idleTimers.get(threadId));
    if (stopped) return;
    idleTimers.set(
      threadId,
      setTimeout(() => void releaseIfIdle(threadId), idleReleaseMs),
    );
  }

  const hasRun = (threadId: string) => [...runs.values()].some((run) => run.threadId === threadId);

  // A run, or a process the agent left running (a dev server), keeps the sandbox; the check comes
  // round again after another idle period.
  async function releaseIfIdle(threadId: string) {
    idleTimers.delete(threadId);
    if (stopped || hasRun(threadId)) return;
    const busy =
      viewers.watching(threadId) > 0 ||
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

  async function runAgent(
    message: Extract<ControlPlaneToRuntime, { type: "run.start" | "run.resume" }>,
  ) {
    const { runId, thread, model } = message;
    // Registered before the sandbox is awaited, so a cancel in that window is not lost.
    const live: LiveRun = { threadId: thread.id };
    runs.set(runId, live);
    clearTimeout(idleTimers.get(thread.id));
    try {
      await releasing.get(thread.id);
      // Clones the repository and starts the thread's container on first use; a failure ends the run with a clear error.
      const box = await options.sandbox.acquire(
        thread,
        () => call("repo.access", { runId }) as Promise<RepoAccess>,
      );
      if (live.cancelReason) throw new Error(live.cancelReason);
      boxes.set(thread.id, box);
      const journaled = await journal;
      // The thread's sandbox as it is now: a run that waited for an answer may find it replaced.
      const current = () => boxes.get(thread.id)?.tools;
      const build = (id: string, attended: boolean): RunInput => {
        const bound = lateBoundTools(box.tools, current);
        const { agent, compaction } = createAgent({
          thread,
          id,
          attended,
          // Only an agent with a person to talk to may take on a goal.
          tools: attended
            ? [...bound, createDefineGoalTool((goal) => goals.set(thread.id, goal))]
            : bound,
          model,
        });
        return { agent, compaction, contextWindow: model?.contextWindow };
      };
      // Events reach the control plane as the journal records them.
      const forward = (event: RunEvent) => send({ type: "run.event", runId, event });
      // The transcript the control plane keeps, filed as each part of the run ends.
      let turn = 0;
      const file = async (messages: Message[]) => {
        if (messages.length === 0) return;
        await call("memory.append", { runId, turn, messages } satisfies MemoryAppendParams);
        turn += messages.length;
      };
      // What an unattended part of the run is told is a note to the agent, not something the user said.
      const withoutPrompt = (messages: Message[]) =>
        messages[0]?.role === "user" ? messages.slice(1) : messages;
      const stopIfCancelled = () => {
        if (live.cancelReason) throw new Error(live.cancelReason);
      };

      const pursueGoal = async (request: GoalRequest) => {
        const exec = current()?.find((tool) => tool.name === "exec_command");
        const working = await journaled.startGoal(
          runId,
          request,
          build(`goal-${runId}`, false),
          verifyWith(exec, request.verifyCommands ?? []),
          forward,
          async (messages) => file(withoutPrompt(messages)),
        );
        live.followed = working;
        return working.done;
      };
      let followed: FollowedRun;
      if (message.type === "run.start") {
        followed = await journaled.start(
          runId,
          thread.id,
          message.prompt,
          build(`run-${runId}`, true),
          forward,
        );
      } else {
        // The question stays parked in the journal; the answer is delivered to it.
        const asked = await journaled.asked(thread.id);
        if (!asked) throw new Error("This thread has no question waiting for an answer");
        const { interaction } = parseAgentContinuation(message.continuation);
        followed = await journaled.answer(
          asked,
          interaction,
          parseAgentInteractionResponse(message.response),
          () => build(asked.agentId, true),
          forward,
        );
      }
      live.followed = followed;
      if (live.cancelReason) void followed.cancel();
      let end = await followed.done;
      if (end.type !== "error") {
        turn = journaled.transcriptTurn(
          followed.durableId,
          end.messages.length,
          end.type === "response",
        );
        await file(end.messages);
      }

      // The turn handed over a goal: work it, then let the agent report on it in the thread.
      const goal = goals.get(thread.id);
      goals.delete(thread.id);
      if (goal && end.type === "response") {
        stopIfCancelled();
        const goalEnd = await pursueGoal(goal);
        if (goalEnd.type === "error") {
          end = goalEnd;
        } else {
          stopIfCancelled();
          const closing = await journaled.start(
            `${runId}-report`,
            thread.id,
            goalReport(goal.objective, goalEnd),
            build(`run-${runId}-report`, false),
            forward,
          );
          live.followed = closing;
          end = await closing.done;
          if (end.type !== "error") await file(withoutPrompt(end.messages));
        }
      }
      sendOrWarn(
        end.type === "error"
          ? { type: "run.end", runId, outcome: "error", error: live.cancelReason ?? end.error }
          : {
              type: "run.end",
              runId,
              outcome: end.type,
              // What resumes a run that stopped to ask the user; the control plane keeps it.
              continuation: end.type === "interaction" ? end.continuation : undefined,
            },
      );
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      sendOrWarn({ type: "run.end", runId, outcome: "error", error: text });
    } finally {
      // A goal handed over by a run that never got to start it is not the next run's to start.
      goals.delete(thread.id);
      runs.delete(runId);
      scheduleIdleRelease(thread.id);
    }
  }

  // Answers a call of the control plane's with what `work` returns, or with why it failed.
  async function answer(id: string, work: () => Promise<unknown>) {
    try {
      sendOrWarn({ type: "reply", id, ok: true, result: await work() });
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      sendOrWarn({ type: "reply", id, ok: false, error: text });
    }
  }

  async function handle(message: ControlPlaneToRuntime) {
    switch (message.type) {
      case "run.start":
      case "run.resume":
        void runAgent(message);
        return;
      case "run.cancel": {
        const run = runs.get(message.runId);
        if (run) cancelRun(run, message.reason);
        return;
      }
      case "desktop.open":
        void viewers.open(message.viewerId, message.threadId);
        return;
      case "desktop.close":
        viewers.close(message.viewerId);
        return;
      case "call":
        await answer(message.id, () => viewers.call(message.method, message.params));
        return;
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
    ws.binaryType = "arraybuffer";
    socket = ws;
    ws.onopen = () => {
      backoff = RECONNECT_MIN_MS;
      send({ type: "hello", version: WIRE_VERSION });
      connected.resolve();
    };
    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        const frame = decodeViewerFrame(new Uint8Array(event.data));
        if (frame) viewers.write(frame.viewerId, frame.payload);
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
      for (const [, waiting] of pending) waiting.reject(new Error("Disconnected"));
      pending.clear();
      for (const run of runs.values()) cancelRun(run, "Disconnected from the control plane");
      viewers.closeAll();
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
      viewers.closeAll();
      socket?.close();
      await Promise.all(releasing.values());
      await options.sandbox.dispose();
      await journal.then((journaled) => journaled.close()).catch(() => undefined);
    },
  };
}
