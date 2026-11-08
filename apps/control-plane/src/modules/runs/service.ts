import { assertAgentInteractionResponse } from "@anvia/core/agent/interactions";
import { messagesToChat } from "@aven/agents/projection";
import { usageFromHistory } from "@aven/agents/usage";
import { applyEvent, applyUsage } from "@aven/protocol/events";

import { withoutBytes } from "../../attachments";
import { ConflictError, describeError, UnavailableError, UnprocessableError } from "../../errors";
import { parseSaved } from "./continuation";
import type { ConversationStore } from "../../types";
import type {
  ContinuationStore,
  FailureStore,
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
  RunEvent,
  ThreadUsage,
} from "@aven/protocol/types";

type ActiveRun = {
  handle: RuntimeRun;
  messages: ChatMessage[];
  usage: ThreadUsage;
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
  failure?: string | null;
};

export class RunBusyError extends ConflictError {
  constructor() {
    super("A run is already in progress for this thread");
  }
}

const PING_MS = 5_000;

export class RunManager {
  #channels = new Map<string, Channel>();
  #store: ConversationStore;
  #runtime: Runtime;
  #onRunFinished: (thread: RunThread, ending: RunEnding, run: FinishedRun) => void | Promise<void>;
  #continuations: ContinuationStore;
  #failures: FailureStore;

  constructor(deps: {
    store: ConversationStore;
    runtime: Runtime;
    onRunFinished: (thread: RunThread, ending: RunEnding, run: FinishedRun) => void | Promise<void>;
    continuations: ContinuationStore;
    failures: FailureStore;
  }) {
    this.#store = deps.store;
    this.#onRunFinished = deps.onRunFinished;
    this.#runtime = deps.runtime;
    this.#continuations = deps.continuations;
    this.#failures = deps.failures;
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
      compact,
      memory,
      cockpit,
    }: RunExtras = {},
  ) {
    const channel = this.#channel(thread);
    if (channel.run) throw new RunBusyError();

    const handle = this.#runtime.start({
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
      memory,
      cockpit,
      model: model ?? undefined,
    });
    const opening: Extract<RunEvent, { type: "run_start" }> = { type: "run_start", prompt };
    if (attachments.length > 0) opening.attachments = attachments.map(withoutBytes);
    if (mentions.length > 0) opening.mentions = mentions;
    await this.#begin(channel, handle, opening);
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
      memory,
      cockpit,
    }: Omit<RunExtras, "attachments" | "mentions"> = {},
  ) {
    const channel = this.#channel(thread);
    if (channel.run) throw new RunBusyError();

    const saved = parseSaved(continuation);
    const response = { type: "tool-question", answers } as const;
    try {
      assertAgentInteractionResponse(saved.interaction, response);
    } catch (error) {
      throw new UnprocessableError(errorMessage(error));
    }

    await this.#store.load({ scope: this.#scope(thread) }).catch((error: unknown) => {
      console.warn(`Could not load the history of thread ${thread.id}:`, error);
      throw new UnavailableError("The thread's history could not be loaded; try again shortly");
    });
    const handle = this.#runtime.resume({
      thread,
      continuation: saved,
      response,
      skills,
      mcp,
      github,
      env,
      identity,
      memory,
      cockpit,
      model: model ?? undefined,
    });
    await this.#begin(channel, handle, { type: "run_resume" }, () =>
      this.#continuations.clear(thread.id),
    );
  }

  async #begin(
    channel: Channel,
    handle: RuntimeRun,
    opening: RunEvent,
    prepare: () => Promise<void> = async () => undefined,
  ) {
    const { thread } = channel;
    const run: ActiveRun = {
      handle,
      messages: [],
      usage: usageFromHistory([]),
      cancelled: false,
      startedAt: Date.now(),
      lastEventAt: Date.now(),
      ready: Promise.resolve(),
      steers: new Map(),
      steerIds: new Set(),
      finished: Promise.withResolvers<void>(),
    };
    channel.run = run;
    const loaded = this.#store
      .load({ scope: this.#scope(thread) })
      .then((history) => {
        run.messages = messagesToChat(history);
        run.usage = usageFromHistory(history);
      })
      .then(prepare);
    run.ready = loaded.catch(() => undefined);
    try {
      await loaded;
    } catch (error) {
      channel.run = undefined;
      run.finished.resolve();
      handle.cancel("history load failed");
      console.warn(`Could not load the history of thread ${thread.id}:`, error);
      throw new UnavailableError("The thread's history could not be loaded; try again shortly");
    }
    this.#emit(channel, opening);
    this.#recordFailure(channel, null);
    void this.#consume(channel, run);
  }

  cancel(threadId: string) {
    const run = this.#channels.get(threadId)?.run;
    if (!run) return false;
    run.cancelled = true;
    run.handle.cancel("Cancelled by user");
    return true;
  }

  async steer(thread: RunThread, message: QueuedSteer): Promise<"queued" | "ended"> {
    const channel = this.#channels.get(thread.id);
    const run = channel?.run;
    if (!channel || !run) return "ended";
    if (run.steerIds.has(message.id)) throw new ConflictError("That message was sent already");
    run.steerIds.add(message.id);
    run.steers.set(message.id, message);
    this.#emit(channel, { type: "steer_queued", ...message });
    let result: Awaited<ReturnType<RuntimeRun["steer"]>>;
    try {
      result = await run.handle.steer(message);
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

  async *events(thread: RunThread, signal: AbortSignal): AsyncGenerator<RunEvent | null> {
    const channel = this.#channel(thread);
    const queue: RunEvent[] = [];
    let wake: (() => void) | undefined;
    const listener = (event: RunEvent) => {
      queue.push(event);
      wake?.();
    };
    channel.subscribers.add(listener);
    const aborted = new Promise<undefined>((resolve) => {
      signal.addEventListener("abort", () => resolve(undefined), { once: true });
    });
    try {
      const snapshot = await this.#attach(channel, queue);
      yield { type: "snapshot", ...snapshot };
      while (!signal.aborted) {
        const event = queue.shift();
        if (event) {
          yield event;
          continue;
        }
        const timer = Bun.sleep(PING_MS).then(() => null);
        const arrived = new Promise<undefined>((resolve) => {
          wake = () => resolve(undefined);
        });
        const woke = await Promise.race([arrived, aborted, timer]);
        wake = undefined;
        if (woke === null && queue.length === 0 && !signal.aborted) yield null;
      }
    } finally {
      channel.subscribers.delete(listener);
    }
  }

  async history(thread: RunThread) {
    const run = this.#channels.get(thread.id)?.run;
    if (run) return run.messages;
    return messagesToChat(await this.#store.load({ scope: this.#scope(thread) }));
  }

  dispose() {
    for (const channel of this.#channels.values()) channel.run?.handle.cancel("Shutting down");
    this.#runtime.dispose();
  }

  #scope(thread: RunThread) {
    return { sessionId: thread.id, metadata: { organizationId: thread.organizationId } };
  }

  #channel(thread: RunThread): Channel {
    const existing = this.#channels.get(thread.id);
    if (existing) return existing;

    const channel: Channel = { thread, subscribers: new Set() };
    this.#channels.set(thread.id, channel);
    return channel;
  }

  async #attach(channel: Channel, queue: RunEvent[]) {
    for (;;) {
      const run = channel.run;
      if (run) {
        await run.ready;
        if (channel.run !== run) continue;
        queue.length = 0;
        return {
          messages: run.messages,
          running: true,
          usage: run.usage,
          runningMs: Date.now() - run.startedAt,
          steers: [...run.steers.values()],
        };
      }
      const [history, failure] = await Promise.all([
        this.#store.load({ scope: this.#scope(channel.thread) }),
        this.#failure(channel),
      ]);
      if (channel.run) continue;
      queue.length = 0;
      const snapshot: Omit<Extract<RunEvent, { type: "snapshot" }>, "type"> = {
        messages: messagesToChat(history),
        running: false,
        usage: usageFromHistory(history),
      };
      if (failure) snapshot.error = failure;
      return snapshot;
    }
  }

  #emit(channel: Channel, event: RunEvent) {
    const { run } = channel;
    if (run) {
      run.messages = applyEvent(run.messages, event);
      run.lastEventAt = Date.now();
    }
    if (event.type === "usage" && run) run.usage = applyUsage(run.usage, event);
    for (const subscriber of channel.subscribers) subscriber(event);
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
      } else if (outcome.type !== "response") {
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
    this.#emit(
      channel,
      ending.outcome === "failed" ? { type: "error", message: ending.error } : { type: "done" },
    );
    if (ending.outcome === "failed") this.#recordFailure(channel, ending.error);
    if (channel.run === run) channel.run = undefined;
    run.finished.resolve();
    const finished = { startedAt: run.startedAt };
    Promise.resolve(this.#onRunFinished(channel.thread, ending, finished)).catch((error) => {
      console.warn(`Could not update thread ${channel.thread.id} after its run:`, error);
    });
  }
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
