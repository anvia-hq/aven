import { assertAgentInteractionResponse } from "@anvia/core/agent/interactions";
import { latestMessages, messagesBefore } from "@aven/protocol/message-window";
import { usageFromHistory } from "@aven/agents/usage";
import { applyEvent, applyLimits, applyUsage } from "@aven/protocol/events";

import { withoutBytes } from "@aven/server-kit/attachments";
import {
  ConflictError,
  describeError,
  UnavailableError,
  UnprocessableError,
} from "@aven/server-kit/errors";
import { followStream } from "@aven/server-kit/event-stream";
import { parseSaved } from "./continuation";
import { ThreadHistory } from "./history";
import type { ConversationStore } from "../../types";
import type {
  ContinuationStore,
  FailureStore,
  ContextSplitStore,
  LimitStore,
  NarrationStore,
  RunNarrator,
  SenderStore,
  WorkedTimeStore,
  FinishedRun,
  RunEnding,
  RunExtras,
  RunThread,
  Runtime,
  RuntimeRun,
} from "./types";
import type { ModelConfig } from "@aven/agents/types";
import type {
  ChatMessage,
  QuestionAnswer,
  QueuedSteer,
  RunAttachment,
  RunEvent,
  SandboxPhase,
  ThreadUsage,
  ToolNarration,
  ToolPart,
} from "@aven/protocol/types";

const answerMark = (messages: ChatMessage[]) =>
  `${messages.length}:${messages.findLast((message) => message.role === "assistant")?.parts.length ?? 0}`;

type ActiveRun = {
  handle: RuntimeRun;
  trackSandbox: boolean;
  markAtStart: string;
  messages: ChatMessage[];
  usage: ThreadUsage;
  narrations: Record<string, ToolNarration>;
  narrationController: AbortController;
  narrationQueue: ToolPart[];
  narrationInFlight: number;
  cancelled: boolean;
  startedAt: number;
  lastEventAt: number;
  ready: Promise<void>;
  steers: Map<string, QueuedSteer>;
  steerIds: Set<string>;
  finished: PromiseWithResolvers<void>;
};

type Channel = {
  thread: RunThread;
  subscribers: Set<(event: RunEvent) => void>;
  run?: ActiveRun;
  starting?: boolean;
  failure?: string | null;
  sandboxPhase?: SandboxPhase;
};

export class RunBusyError extends ConflictError {
  constructor() {
    super("A run is already in progress for this thread");
  }
}

const PING_MS = 5_000;
const DRAIN_POLL_MS = 250;
const MAX_NARRATION_CONCURRENCY = 2;
const MAX_NARRATION_QUEUE = 20;

export class RunManager {
  #channels = new Map<string, Channel>();
  #history: ThreadHistory;
  #runtime: Runtime;
  #onRunFinished: (thread: RunThread, ending: RunEnding, run: FinishedRun) => void | Promise<void>;
  #continuations: ContinuationStore;
  #failures: FailureStore;
  #narrator?: RunNarrator;
  #draining = false;

  constructor(deps: {
    store: ConversationStore;
    runtime: Runtime;
    onRunFinished: (thread: RunThread, ending: RunEnding, run: FinishedRun) => void | Promise<void>;
    continuations: ContinuationStore;
    failures: FailureStore;
    workedTimes: WorkedTimeStore;
    senders: SenderStore;
    limits: LimitStore;
    splits?: ContextSplitStore;
    narrations?: NarrationStore;
    narrator?: RunNarrator;
  }) {
    this.#history = new ThreadHistory(
      deps.store,
      deps.workedTimes,
      deps.senders,
      deps.limits,
      deps.splits,
      deps.narrations,
    );
    this.#onRunFinished = deps.onRunFinished;
    this.#runtime = deps.runtime;
    this.#continuations = deps.continuations;
    this.#failures = deps.failures;
    this.#narrator = deps.narrator;
  }

  runningCount() {
    let count = 0;

    for (const channel of this.#channels.values()) if (channel.run) count += 1;

    return count;
  }

  async drain(timeoutMs: number) {
    this.#draining = true;
    const deadline = Date.now() + timeoutMs;

    while (this.runningCount() > 0 && Date.now() < deadline) await Bun.sleep(DRAIN_POLL_MS);

    return this.runningCount();
  }

  isRunning(threadId: string) {
    return this.#channels.get(threadId)?.run !== undefined;
  }

  activity(threadId: string): { startedAt: number; lastEventAt: number } | undefined {
    const run = this.#channels.get(threadId)?.run;
    return run && { startedAt: run.startedAt, lastEventAt: run.lastEventAt };
  }

  async start(
    thread: RunThread,
    prompt: string,
    model?: ModelConfig | null,
    {
      attachments = [],
      mentions = [],
      skills = [],
      mcp = [],
      github,
      env,
      identity,
      webSearch,
      lens,
      compact,
      memory,
      cockpit,
      senderId,
      claudeToken,
      claudeModel,
      claudeEffort,
      codexToken,
      codexModel,
      codexEffort,
    }: RunExtras = {},
  ) {
    await this.#reserved(this.#channel(thread), async (channel) => {
      let handle: RuntimeRun;
      try {
        handle = await this.#runtime.start({
          thread,
          prompt,
          compact,
          attachments,
          mentions,
          skills,
          mcp,
          github,
          env,
          identity,
          webSearch,
          lens,
          memory,
          cockpit,
          model: model ?? undefined,
          claudeToken,
          claudeModel,
          claudeEffort,
          codexToken,
          codexModel,
          codexEffort,
          onSandboxPhase: !compact
            ? async (phase) => {
                if (channel.sandboxPhase !== undefined) return;

                const prior = await this.#history.loadMessages(thread).catch(() => []);

                if (channel.starting && prior.length === 0) this.#setSandboxPhase(channel, phase);
              }
            : undefined,
        });
      } catch (error) {
        this.#clearSandboxPhase(channel);
        throw error;
      }
      const opening: Extract<RunEvent, { type: "run_start" }> = { type: "run_start", prompt };

      if (senderId) opening.senderId = senderId;

      if (attachments.length > 0) opening.attachments = attachments.map(withoutBytes);

      if (mentions.length > 0) opening.mentions = mentions;

      await this.#begin(channel, handle, opening, undefined, !compact);
    });
  }

  async answer(
    thread: RunThread,
    continuation: unknown,
    answers: QuestionAnswer[],
    model?: ModelConfig | null,
    {
      skills = [],
      mcp = [],
      github,
      env,
      identity,
      webSearch,
      lens,
      memory,
      cockpit,
      claudeToken,
      claudeModel,
      claudeEffort,
      codexToken,
      codexModel,
      codexEffort,
    }: Omit<RunExtras, "attachments" | "mentions"> = {},
  ) {
    await this.#reserved(this.#channel(thread), async (channel) => {
      const saved = parseSaved(continuation);
      const response = { type: "tool-question", answers } as const;
      try {
        assertAgentInteractionResponse(saved.interaction, response);
      } catch (error) {
        throw new UnprocessableError(errorMessage(error));
      }

      await this.#history.loadRaw(thread).catch((error: unknown) => {
        console.warn(`Could not load the history of thread ${thread.id}:`, error);
        throw new UnavailableError("The thread's history could not be loaded; try again shortly");
      });
      const handle = await this.#runtime.resume({
        thread,
        continuation: saved,
        response,
        skills,
        mcp,
        github,
        env,
        identity,
        webSearch,
        lens,
        memory,
        cockpit,
        model: model ?? undefined,
        claudeToken,
        claudeModel,
        claudeEffort,
        codexToken,
        codexModel,
        codexEffort,
      });
      await this.#begin(channel, handle, { type: "run_resume" }, () =>
        this.#continuations.clear(thread.id),
      );
    });
  }

  async #reserved(channel: Channel, work: (channel: Channel) => Promise<void>) {
    if (this.#draining) throw new UnavailableError("The server is restarting; try again shortly");

    if (channel.run || channel.starting) throw new RunBusyError();

    channel.starting = true;
    try {
      await work(channel);
    } finally {
      channel.starting = false;
      this.#release(channel);
    }
  }

  async #begin(
    channel: Channel,
    handle: RuntimeRun,
    opening: RunEvent,
    prepare: () => Promise<void> = async () => undefined,
    allowSandbox = false,
  ) {
    const { thread } = channel;
    const run: ActiveRun = {
      handle,
      trackSandbox: false,
      markAtStart: "",
      messages: [],
      usage: usageFromHistory([]),
      narrations: {},
      narrationController: new AbortController(),
      narrationQueue: [],
      narrationInFlight: 0,
      cancelled: false,
      startedAt: Date.now(),
      lastEventAt: Date.now(),
      ready: Promise.resolve(),
      steers: new Map(),
      steerIds: new Set(),
      finished: Promise.withResolvers<void>(),
    };
    channel.run = run;
    const loaded = this.#history
      .loadState(thread)
      .then(({ messages, usage, narrations }) => {
        run.messages = messages;
        run.usage = run.usage.limits ? applyLimits(usage, run.usage.limits) : usage;
        run.narrations = { ...narrations, ...run.narrations };
      })
      .then(prepare);
    run.ready = loaded.catch(() => undefined);
    try {
      await loaded;
    } catch (error) {
      channel.run = undefined;
      this.#clearSandboxPhase(channel);
      run.finished.resolve();
      handle.cancel("history load failed");
      console.warn(`Could not load the history of thread ${thread.id}:`, error);
      throw new UnavailableError("The thread's history could not be loaded; try again shortly");
    }

    if (opening.type === "run_start") {
      run.trackSandbox = allowSandbox && handle.sandbox === true && run.messages.length === 0;
      this.#history.recordSender(channel.thread.id, run.messages.length, opening.senderId);
    }

    this.#emit(channel, opening);
    run.markAtStart = answerMark(run.messages);
    this.#recordFailure(channel, null);
    void this.#consume(channel, run);
  }

  cancel(threadId: string) {
    const run = this.#channels.get(threadId)?.run;

    if (!run) return false;

    run.cancelled = true;
    run.narrationQueue.length = 0;
    run.narrationController.abort();
    run.handle.cancel("Cancelled by user");
    return true;
  }

  async steer(
    thread: RunThread,
    message: QueuedSteer,
    files?: RunAttachment[],
  ): Promise<"queued" | "ended"> {
    const channel = this.#channels.get(thread.id);

    if (!channel) return "ended";

    channel.thread = thread;
    const run = channel.run;

    if (!run) return "ended";

    if (run.steerIds.has(message.id)) throw new ConflictError("That message was sent already");

    run.steerIds.add(message.id);
    run.steers.set(message.id, message);
    this.#emit(channel, { type: "steer_queued", ...message });
    let result: Awaited<ReturnType<RuntimeRun["steer"]>>;
    try {
      result = await run.handle.steer(message, files);
    } catch (error) {
      this.#reject(channel, run, message.id);
      console.warn(`Could not hand a message to the run of thread ${thread.id}:`, error);
      throw new UnavailableError("The runner could not be reached; try again shortly");
    }

    if (result.status === "queued") return "queued";

    this.#reject(channel, run, message.id);

    if (result.status === "refused") throw new ConflictError(result.reason);

    await run.finished.promise;
    return "ended";
  }

  events(thread: RunThread, signal: AbortSignal): AsyncGenerator<RunEvent | null> {
    const channel = this.#channel(thread);
    return followStream<RunEvent>({
      attach: (listener) => {
        channel.subscribers.add(listener);
        return () => {
          channel.subscribers.delete(listener);
          this.#release(channel);
        };
      },
      initial: async (queue) => ({ type: "snapshot", ...(await this.#attach(channel, queue)) }),
      signal,
      pingMs: PING_MS,
    });
  }

  async note(thread: RunThread, prompt: string, senderId?: string) {
    await this.#history.appendNote(thread, prompt, senderId);

    const channel = this.#channels.get(thread.id);

    if (!channel || channel.run) return;

    this.#emit(channel, { type: "snapshot", ...(await this.#attach(channel, [])) });
  }

  async history(thread: RunThread) {
    const run = this.#channels.get(thread.id)?.run;

    if (run) return run.messages;

    return this.#history.loadMessages(thread);
  }

  async latest(thread: RunThread) {
    return latestMessages(await this.history(thread));
  }

  async before(thread: RunThread, before: number) {
    return messagesBefore(await this.history(thread), before);
  }

  dispose() {
    for (const channel of this.#channels.values()) {
      if (channel.run) {
        channel.run.narrationQueue.length = 0;
        channel.run.narrationController.abort();
        channel.run.handle.cancel("Shutting down");
      }
    }
    this.#runtime.dispose();
  }

  #channel(thread: RunThread): Channel {
    const existing = this.#channels.get(thread.id);

    if (existing) {
      existing.thread = thread;
      return existing;
    }

    const channel: Channel = { thread, subscribers: new Set() };
    this.#channels.set(thread.id, channel);
    return channel;
  }

  #release(channel: Channel) {
    if (channel.run || channel.starting || channel.subscribers.size > 0) return;

    this.#channels.delete(channel.thread.id);
  }

  async #attach(channel: Channel, queue: RunEvent[]) {
    for (;;) {
      const run = channel.run;

      if (run) {
        await run.ready;

        if (channel.run !== run) continue;

        queue.length = 0;
        const shown = latestMessages(run.messages);
        const liveSnapshot: Omit<Extract<RunEvent, { type: "snapshot" }>, "type"> = {
          messages: shown.messages,
          hidden: shown.hidden,
          running: true,
          usage: run.usage,
          runningMs: Date.now() - run.startedAt,
          steers: [...run.steers.values()],
        };

        if (Object.keys(run.narrations).length > 0) liveSnapshot.narrations = { ...run.narrations };

        if (channel.sandboxPhase) liveSnapshot.sandboxPhase = channel.sandboxPhase;

        return liveSnapshot;
      }

      const [state, failure] = await Promise.all([
        this.#history.loadState(channel.thread),
        this.#failure(channel),
      ]);

      if (channel.run) continue;

      queue.length = 0;
      const shown = latestMessages(state.messages);
      const snapshot: Omit<Extract<RunEvent, { type: "snapshot" }>, "type"> = {
        messages: shown.messages,
        hidden: shown.hidden,
        running: false,
        usage: state.usage,
      };

      if (failure) snapshot.error = failure;

      if (Object.keys(state.narrations).length > 0) snapshot.narrations = state.narrations;

      if (channel.sandboxPhase) snapshot.sandboxPhase = channel.sandboxPhase;

      return snapshot;
    }
  }

  #setSandboxPhase(channel: Channel, phase: SandboxPhase) {
    if (phase === "preparing" && channel.sandboxPhase !== undefined) return;

    if (phase === "ready" && channel.sandboxPhase !== "preparing") return;

    channel.sandboxPhase = phase;
    const event: RunEvent = { type: "sandbox_status", phase };
    for (const subscriber of channel.subscribers) subscriber(event);
  }

  #clearSandboxPhase(channel: Channel) {
    if (channel.sandboxPhase !== "preparing") return;

    channel.sandboxPhase = undefined;
    const event: RunEvent = { type: "sandbox_status", phase: null };
    for (const subscriber of channel.subscribers) subscriber(event);
  }

  #emit(channel: Channel, event: RunEvent) {
    const { run } = channel;

    if (event.type === "sandbox_status") {
      if (run?.trackSandbox) {
        if (event.phase === null) this.#clearSandboxPhase(channel);
        else this.#setSandboxPhase(channel, event.phase);
      }

      return;
    }

    if (
      channel.sandboxPhase === "preparing" &&
      (event.type === "text" || event.type === "tool_end")
    ) {
      this.#setSandboxPhase(channel, "ready");
    }

    if (run) {
      run.messages = applyEvent(run.messages, event);
      run.lastEventAt = Date.now();
    }

    if (event.type === "usage" && run) run.usage = applyUsage(run.usage, event);

    if (event.type === "usage" && event.context?.segments) {
      this.#history.recordSplit(
        channel.thread.id,
        event.context.usedTokens,
        event.context.segments,
      );
    }

    if (event.type === "limits" && run) run.usage = applyLimits(run.usage, event.limits);

    if (event.type === "limits") this.#history.recordLimits(channel.thread.id, event.limits);

    for (const subscriber of channel.subscribers) subscriber(event);

    if (event.type === "tool_end" && run && this.#narrator) {
      const finishedTool = findTool(run.messages, event.id);

      if (finishedTool) this.#enqueueNarration(channel.thread.id, run, finishedTool);
    }
  }

  #enqueueNarration(threadId: string, run: ActiveRun, tool: ToolPart) {
    if (run.narrationController.signal.aborted) return;

    if (run.narrationQueue.length >= MAX_NARRATION_QUEUE) run.narrationQueue.shift();

    run.narrationQueue.push(tool);
    this.#pumpNarrations(threadId, run);
  }

  #pumpNarrations(threadId: string, run: ActiveRun) {
    while (
      !run.narrationController.signal.aborted &&
      run.narrationInFlight < MAX_NARRATION_CONCURRENCY &&
      run.narrationQueue.length > 0
    ) {
      const tool = run.narrationQueue.shift()!;
      run.narrationInFlight += 1;
      void this.#narrate(threadId, run, tool).finally(() => {
        run.narrationInFlight -= 1;
        this.#pumpNarrations(threadId, run);
      });
    }
  }

  async #narrate(threadId: string, run: ActiveRun, tool: ToolPart) {
    const narration = await this.#narrator
      ?.narrate(tool, run.narrationController.signal)
      .catch(() => null);

    if (!narration || run.narrationController.signal.aborted) return;

    const currentChannel = this.#channels.get(threadId);

    if (currentChannel?.run === run) run.narrations[narration.toolId] = narration;

    this.#history.recordNarration(threadId, narration);

    if (!currentChannel) return;

    const event: RunEvent = { type: "narration", narration };
    for (const subscriber of currentChannel.subscribers) subscriber(event);
  }

  async #consume(channel: Channel, run: ActiveRun) {
    let failure: string | undefined;
    let asked = false;
    try {
      for await (const event of run.handle.events) {
        if (event.type === "steer_applied") this.#apply(channel, run, event.id);
        else this.#emit(channel, event);
      }
      const outcome = await run.handle.result;

      if (outcome.type === "interaction") {
        await this.#suspend(channel.thread, outcome.continuation);
        asked = true;
      } else if (outcome.type === "response") {
        await this.#continuations.clear(channel.thread.id);
      } else {
        failure = `Run ended without a response (${outcome.type})`;
      }
    } catch (error) {
      failure = errorMessage(error);
    }
    this.#finish(channel, run, endingOf(run.cancelled, asked, failure));
  }

  async #suspend(thread: RunThread, continuation: unknown) {
    const saved = parseSaved(continuation);

    if (saved.interaction.type !== "tool-question") {
      throw new Error(`Run stopped on an unsupported interaction (${saved.interaction.type})`);
    }

    await this.#continuations.save(thread.id, saved);
  }

  #apply(channel: Channel, run: ActiveRun, id: string) {
    const message = run.steers.get(id);

    if (!message) return;

    run.steers.delete(id);
    this.#history.recordSender(channel.thread.id, run.messages.length, message.senderId);
    this.#emit(channel, { type: "steer", ...message });
  }

  #reject(channel: Channel, run: ActiveRun, id: string, reason?: string) {
    if (!run.steers.delete(id)) return;

    this.#emit(channel, { type: "steer_rejected", id, reason });
  }

  async #failure(channel: Channel) {
    if (channel.failure !== undefined) return channel.failure;

    return this.#failures.read(channel.thread.id).catch((error: unknown) => {
      console.warn(`Could not read why the last run of thread ${channel.thread.id} failed:`, error);
      return null;
    });
  }

  #recordFailure(channel: Channel, message: string | null) {
    channel.failure = message;
    this.#failures.record(channel.thread.id, message).catch((error: unknown) => {
      console.warn(`Could not keep why the last run of thread ${channel.thread.id} failed:`, error);
    });
  }

  #finish(channel: Channel, run: ActiveRun, ending: RunEnding) {
    for (const id of run.steers.keys()) {
      this.#reject(channel, run, id, "The run ended before the agent read it");
    }
    const workedMs = Date.now() - run.startedAt;
    const answered = run.messages.findLastIndex((message) => message.role === "assistant");
    const produced = answered !== -1 && answerMark(run.messages) !== run.markAtStart;

    if (channel.sandboxPhase === "preparing") {
      if ((ending.outcome === "done" || ending.outcome === "question") && produced) {
        this.#setSandboxPhase(channel, "ready");
      } else {
        this.#clearSandboxPhase(channel);
      }
    }

    if (ending.outcome === "failed") {
      this.#emit(channel, { type: "error", message: ending.error });
    } else {
      const finishedAt = new Date().toISOString();
      this.#emit(channel, produced ? { type: "done", workedMs, finishedAt } : { type: "done" });

      if (produced) {
        this.#history.recordWorkedTime(channel.thread.id, answered, workedMs, finishedAt);
      }
    }

    if (ending.outcome === "failed") this.#recordFailure(channel, ending.error);

    if (channel.run === run) channel.run = undefined;

    run.finished.resolve();
    const finished = { startedAt: run.startedAt };
    Promise.resolve(this.#onRunFinished(channel.thread, ending, finished)).catch((error) => {
      console.warn(`Could not update thread ${channel.thread.id} after its run:`, error);
    });
    this.#release(channel);
  }
}

function findTool(messages: readonly ChatMessage[], id: string): ToolPart | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]!;

    if (message.role !== "assistant") continue;

    for (let partAt = message.parts.length - 1; partAt >= 0; partAt -= 1) {
      const part = message.parts[partAt]!;

      if (part.type === "tool" && part.tool.id === id) return part.tool;
    }
  }
  return undefined;
}

function endingOf(cancelled: boolean, asked: boolean, failure: string | undefined): RunEnding {
  if (cancelled) return { outcome: "cancelled" };

  if (failure !== undefined) return { outcome: "failed", error: failure };

  return asked ? { outcome: "question" } : { outcome: "done" };
}

function errorMessage(error: unknown) {
  const message = describeError(error);
  return message.length > 300 ? `${message.slice(0, 300)}…` : message;
}
