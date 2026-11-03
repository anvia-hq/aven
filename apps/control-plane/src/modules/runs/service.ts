import { assertAgentInteractionResponse } from "@anvia/core/agent/interactions";
import type { ModelConfig } from "@aven/agents/model";
import { messagesToChat } from "@aven/agents/projection";
import { usageFromHistory } from "@aven/agents/usage";
import {
  applyEvent,
  applyUsage,
  type ChatMessage,
  type QueuedSteer,
  type QuestionAnswer,
  type RunEvent,
  type ThreadUsage,
} from "@aven/protocol/events";

import { withoutBytes } from "../../attachments";
import { ConflictError, describeError, UnavailableError, UnprocessableError } from "../../errors";
import type { ConversationStore } from "../../memory-store";
import { parseSaved } from "./continuation";
import type { RunExtras, Runtime, RunThread, RuntimeRun } from "./runtime";

type ActiveRun = {
  handle: RuntimeRun;
  /** The whole transcript so far: history plus this run, kept current by applying events. */
  messages: ChatMessage[];
  /** What the thread has used: its history plus this run, kept current like `messages`. */
  usage: ThreadUsage;
  cancelled: boolean;
  /** When the run was claimed (`Date.now()`), so a client that attaches late can say how long it has gone on. */
  startedAt: number;
  /** When the run last had an event (`Date.now()`), so a run that shows nothing for long is noticed (decision 0101). */
  lastEventAt: number;
  /** Settles once history has been loaded into `messages` (or failed to); never rejects. */
  ready: Promise<void>;
  /** What the person said during the run that the agent has not taken yet (decision 0098), by id. */
  steers: Map<string, QueuedSteer>;
  /** Every id a message of this run has had, taken or not: an id names one message. */
  steerIds: Set<string>;
  /** Settles once the run is over and the thread has no run any more. */
  finished: PromiseWithResolvers<void>;
};

type Channel = {
  thread: RunThread;
  subscribers: Set<(event: RunEvent) => void>;
  run?: ActiveRun;
  /**
   * Why the latest run failed (null: it did not), once this process knows; undefined until then,
   * when the failure store says.
   */
  failure?: string | null;
};

export type ContinuationStore = {
  save(threadId: string, continuation: unknown): Promise<void>;
  clear(threadId: string): Promise<void>;
};

/**
 * Why a thread's latest run failed, kept with the thread (decision 0100): the `error` event reaches
 * only the clients attached when it happens, and one that opens the thread later is told too.
 */
export type FailureStore = {
  /** Sets the failure, or clears it with null. */
  record(threadId: string, message: string | null): Promise<void>;
  read(threadId: string): Promise<string | null>;
};

/** How a run ended, for what follows it (decision 0101): a bot that sent it is told. */
export type RunEnding =
  | { outcome: "done" }
  | { outcome: "failed"; error: string }
  | { outcome: "question" }
  | { outcome: "cancelled" };

/** Which run ended: its start, which `activity` gave while it ran. */
export type FinishedRun = { startedAt: number };

export class RunBusyError extends ConflictError {
  constructor() {
    super("A run is already in progress for this thread");
  }
}

const PING_MS = 5_000;

// Runs belong to the server, not to an HTTP request: a client can disconnect or reload and the
// agent keeps working. Clients attach with `events()` and get a snapshot, then live events.
export class RunManager {
  #channels = new Map<string, Channel>();
  #store: ConversationStore;
  #runtime: Runtime;
  #onRunFinished: (thread: RunThread, ending: RunEnding, run: FinishedRun) => void | Promise<void>;
  #continuations: ContinuationStore;
  #failures: FailureStore;

  constructor(deps: {
    store: ConversationStore;
    /** Where runs execute. */
    runtime: Runtime;
    /**
     * Called after every run with how it ended and which run it was, e.g. to bump the thread in the
     * list. Its first step runs before anything else does, so it can mark the run as ending.
     */
    onRunFinished: (thread: RunThread, ending: RunEnding, run: FinishedRun) => void | Promise<void>;
    /** Where a run that stopped on the agent's question waits for the answer. */
    continuations: ContinuationStore;
    /** Where why the latest run failed is kept for clients that come later. */
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

  /** When the thread's run started and last had an event, while it has one. */
  activity(threadId: string): { startedAt: number; lastEventAt: number } | undefined {
    const run = this.#channels.get(threadId)?.run;
    return run && { startedAt: run.startedAt, lastEventAt: run.lastEventAt };
  }

  // Starts a run on the thread. Throws RunBusyError if one is live, or the setup error (such as a
  // missing API key) before anything is persisted. `model` is the sender's provider; callers
  // resolve it first because this must claim the slot synchronously. Without one, the
  // environment's is used. `attachments` are the files sent with the prompt (decision 0034),
  // `mentions` the files and skills it points at (decision 0036).
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
      model: model ?? undefined,
    });
    const opening: Extract<RunEvent, { type: "run_start" }> = { type: "run_start", prompt };
    // The transcript has what was sent, not the bytes.
    if (attachments.length > 0) opening.attachments = attachments.map(withoutBytes);
    if (mentions.length > 0) opening.mentions = mentions;
    await this.#begin(channel, handle, opening);
  }

  // Continues the run that stopped on the agent's question: `continuation` is what was saved when it
  // stopped. The answers must be the questions' own, and the run continues in the same assistant
  // message. Throws like `start`; a failed start leaves the question waiting.
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
      model: model ?? undefined,
    });
    // Consumed: from here the question is answered, whatever becomes of the run.
    await this.#begin(channel, handle, { type: "run_resume" }, () =>
      this.#continuations.clear(thread.id),
    );
  }

  // Claims the thread for a run, loads its history, and starts relaying it.
  async #begin(
    channel: Channel,
    handle: RuntimeRun,
    opening: RunEvent,
    prepare: () => Promise<void> = async () => undefined,
  ) {
    const { thread } = channel;
    // Claim the slot before the first await so two concurrent starts cannot both proceed.
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
    const loaded = prepare()
      .then(() => this.#store.load({ scope: this.#scope(thread) }))
      .then((history) => {
        run.messages = messagesToChat(history);
        run.usage = usageFromHistory(history);
      });
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

  // Stops the run. What it left running in its sandbox, such as a dev server, is not touched.
  cancel(threadId: string) {
    const run = this.#channels.get(threadId)?.run;
    if (!run) return false;
    run.cancelled = true;
    run.handle.cancel("Cancelled by user");
    return true;
  }

  /**
   * Hands the run a message the person sent while it works (decision 0098). It is `queued` once the
   * runner has it, and the agent takes it at its next safe step: `steer` follows in the events,
   * which every client shows the same way. `ended` when there is no run to take it, or it was
   * finishing and has now ended, which is for the caller to send as a message of its own. Throws
   * when the runner refuses it or cannot be asked; clients first hear it as `steer_queued` and
   * then as `steer_rejected`, so what they showed of it goes away.
   */
  async steer(thread: RunThread, message: QueuedSteer): Promise<"queued" | "ended"> {
    const channel = this.#channels.get(thread.id);
    const run = channel?.run;
    if (!channel || !run) return "ended";
    if (run.steerIds.has(message.id)) throw new ConflictError("That message was sent already");
    run.steerIds.add(message.id);
    // Before the runner is asked, so that its word that the agent took it, which can come before
    // its answer, finds the message.
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
    // The agent is finishing: its run is over in a moment, and the message starts the next.
    await run.finished.promise;
    return "ended";
  }

  // Attaches a client: yields a snapshot, then live events, with `null` as a keep-alive tick.
  // Dropping the iterator detaches the client and leaves any run untouched.
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

  // Stops every run. Call on host shutdown.
  dispose() {
    for (const channel of this.#channels.values()) channel.run?.handle.cancel("Shutting down");
    this.#runtime.dispose();
  }

  #scope(thread: RunThread) {
    // The organization comes from the thread row, never from the client.
    return { sessionId: thread.id, metadata: { organizationId: thread.organizationId } };
  }

  #channel(thread: RunThread): Channel {
    const existing = this.#channels.get(thread.id);
    if (existing) return existing;

    const channel: Channel = { thread, subscribers: new Set() };
    this.#channels.set(thread.id, channel);
    return channel;
  }

  // Picks the transcript a new client starts from, and drops events it already contains. The read
  // and the queue reset happen in one synchronous step, so nothing is applied twice or missed.
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
        // A runner says the agent took a message by its id; the words are ours.
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

  // The agent asked a question: its run ends here, and what resumes it is kept until it is answered.
  // The question itself is in the transcript, which the run's events and the history both carry.
  async #suspend(thread: RunThread, continuation: unknown) {
    const saved = parseSaved(continuation);
    if (saved.interaction.type !== "tool-question") {
      throw new Error(`Run stopped on an unsupported interaction (${saved.interaction.type})`);
    }
    await this.#continuations.save(thread.id, saved);
  }

  // The agent took a message the person sent while it worked: it is their next message.
  #apply(channel: Channel, run: ActiveRun, id: string) {
    const message = run.steers.get(id);
    if (!message) return;
    run.steers.delete(id);
    this.#emit(channel, { type: "steer", ...message });
  }

  // A message the agent will not take: clients stop showing it as waiting. A `reason` is for the
  // person; without one they have been told another way, or it is sent as a message of its own.
  #reject(channel: Channel, run: ActiveRun, id: string, reason?: string) {
    if (!run.steers.delete(id)) return;
    this.#emit(channel, { type: "steer_rejected", id, reason });
  }

  // What this process knows of the latest run's failure, else what the store kept, which is only
  // the way to it after a restart: a store that cannot be read says nothing failed.
  async #failure(channel: Channel) {
    if (channel.failure !== undefined) return channel.failure;
    return this.#failures.read(channel.thread.id).catch((error: unknown) => {
      console.warn(`Could not read why the last run of thread ${channel.thread.id} failed:`, error);
      return null;
    });
  }

  // Known here at once, kept in the store for later; a store that fails only costs a restart's memory.
  #recordFailure(channel: Channel, message: string | null) {
    channel.failure = message;
    this.#failures.record(channel.thread.id, message).catch((error: unknown) => {
      console.warn(`Could not keep why the last run of thread ${channel.thread.id} failed:`, error);
    });
  }

  #finish(channel: Channel, run: ActiveRun, ending: RunEnding) {
    // Whatever the agent never took was not delivered; the person is told, with what they said.
    for (const id of run.steers.keys()) {
      this.#reject(channel, run, id, "The run ended before the agent read it");
    }
    // A run the user cancelled ends quietly, whatever the runtime reported.
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

// A run the user cancelled is cancelled whatever the runtime reported; else it failed, asked or was done.
function endingOf(cancelled: boolean, asked: boolean, failure: string | undefined): RunEnding {
  if (cancelled) return { outcome: "cancelled" };
  if (failure !== undefined) return { outcome: "failed", error: failure };
  return asked ? { outcome: "question" } : { outcome: "done" };
}

function errorMessage(error: unknown) {
  const message = describeError(error);
  return message.length > 300 ? `${message.slice(0, 300)}…` : message;
}
