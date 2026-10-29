import type { ConversationStore } from "@aven/agents/memory";
import type { ModelConfig } from "@aven/agents/model";
import { messagesToChat } from "@aven/agents/projection";
import { applyEvent, type ChatMessage, type RunEvent } from "@aven/protocol/events";

import { ConflictError, UnavailableError } from "../../errors";
import { memoryStore } from "../../memory-store";
import { providersService, type ModelSelection } from "../providers/service";
import { threadsService } from "../threads/service";
import type { Runtime, RunThread, RuntimeRun } from "./runtime";
import { RemoteRuntime } from "./remote-runtime";
import { runGateway } from "../runtimes/gateway";
import { runtimeHub } from "../runtimes/hub";

type ActiveRun = {
  handle: RuntimeRun;
  /** The whole transcript so far: history plus this run, kept current by applying events. */
  messages: ChatMessage[];
  cancelled: boolean;
  /** Settles once history has been loaded into `messages` (or failed to); never rejects. */
  ready: Promise<void>;
};

type Channel = {
  thread: RunThread;
  subscribers: Set<(event: RunEvent) => void>;
  run?: ActiveRun;
  /** Who sent the last message and what they chose; a run restarted by a finished background job reuses it. */
  lastSender?: { userId: string; selection?: ModelSelection };
};

export class RunBusyError extends ConflictError {
  constructor() {
    super("A run is already in progress for this thread");
  }
}

type ResolveModel = (userId: string, selection?: ModelSelection) => Promise<ModelConfig | null>;

const PING_MS = 5_000;

// Runs belong to the server, not to an HTTP request: a client can disconnect, reload or never
// connect at all (a background job finishing starts a run with nobody watching) and the agent
// keeps working. Clients attach with `events()` and get a snapshot, then live events.
export class RunManager {
  #channels = new Map<string, Channel>();
  #disposed = false;
  #store: ConversationStore;
  #runtime: Runtime;
  #resolveModel: ResolveModel;
  #onRunFinished: (thread: RunThread) => void | Promise<void>;

  constructor(deps: {
    store: ConversationStore;
    /** Where runs execute. */
    runtime: Runtime;
    /** Looks up a user's provider when a background job restarts a run on their behalf. */
    resolveModel: ResolveModel;
    /** Called after every run, e.g. to bump the thread in the list. */
    onRunFinished: (thread: RunThread) => void | Promise<void>;
  }) {
    this.#store = deps.store;
    this.#onRunFinished = deps.onRunFinished;
    this.#runtime = deps.runtime;
    this.#runtime.onJobNotice((threadId, notice) => this.#jobNotice(threadId, notice));
    this.#resolveModel = deps.resolveModel;
  }

  isRunning(threadId: string) {
    return this.#channels.get(threadId)?.run !== undefined;
  }

  // Starts a run on the thread. Throws RunBusyError if one is live, or the setup error (such as a
  // missing API key) before anything is persisted. `sender` is who is sending the message and the
  // provider to run it with; callers resolve it first because this must claim the slot synchronously.
  async start(
    thread: RunThread,
    prompt: string,
    sender?: { userId: string; model?: ModelConfig | null; selection?: ModelSelection },
  ) {
    const channel = this.#channel(thread);
    if (channel.run) throw new RunBusyError();
    if (sender) channel.lastSender = { userId: sender.userId, selection: sender.selection };

    const handle = this.#runtime.start({ thread, prompt, model: sender?.model ?? undefined });
    // Claim the slot before the first await so two concurrent starts cannot both proceed.
    const run: ActiveRun = { handle, messages: [], cancelled: false, ready: Promise.resolve() };
    channel.run = run;
    const loaded = this.#store.load({ scope: this.#scope(thread) }).then((history) => {
      run.messages = messagesToChat(history);
    });
    run.ready = loaded.catch(() => undefined);
    try {
      await loaded;
    } catch (error) {
      channel.run = undefined;
      handle.cancel("history load failed");
      console.warn(`Could not load the history of thread ${thread.id}:`, error);
      throw new UnavailableError("The thread's history could not be loaded; try again shortly");
    }
    this.#emit(channel, { type: "run_start", prompt });
    void this.#consume(channel, run);
  }

  // Stops the run and everything it started in the background, so nothing resumes it afterwards.
  cancel(threadId: string) {
    const channel = this.#channels.get(threadId);
    if (!channel) return false;
    const run = channel.run;
    if (run) {
      run.cancelled = true;
      run.handle.cancel("Cancelled by user");
    }
    this.#runtime.stopJobs(channel.thread);
    return run !== undefined;
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

  // Stops every running job and run. Call on host shutdown.
  dispose() {
    this.#disposed = true;
    for (const channel of this.#channels.values()) channel.run?.handle.cancel("Shutting down");
    this.#runtime.dispose();
  }

  #scope(thread: RunThread) {
    // The organization comes from the thread row, never from the client.
    return { sessionId: thread.id, metadata: { organizationId: thread.organizationId } };
  }

  #channel(thread: RunThread): Channel {
    let channel = this.#channels.get(thread.id);
    if (channel) return channel;

    const created: Channel = { thread, subscribers: new Set() };
    this.#channels.set(thread.id, created);
    channel = created;
    return channel;
  }

  // A background job finished: its notice goes into the live run, or starts a new one if it ended.
  #jobNotice(threadId: string, notice: string) {
    const channel = this.#channels.get(threadId);
    if (!channel || this.#disposed) return;
    if (this.#steerLive(channel, notice)) return;
    void this.#restart(channel, channel.thread, notice);
  }

  // False when there is no live run to take the message, or it has just ended.
  #steerLive(channel: Channel, notice: string) {
    if (!channel.run) return false;
    try {
      channel.run.handle.steer(notice);
      return true;
    } catch {
      return false;
    }
  }

  // Starts a run for a finished background job, with whatever whoever last sent a message chose.
  async #restart(channel: Channel, thread: RunThread, notice: string) {
    const sender = channel.lastSender;
    try {
      const model = sender ? await this.#modelForRestart(sender) : null;
      await this.start(thread, notice, sender && { ...sender, model });
    } catch (error) {
      // A run that started meanwhile has not seen the notice: hand it over.
      const delivered = error instanceof RunBusyError && this.#steerLive(channel, notice);
      if (delivered) return;
      console.warn(`Could not deliver a finished job's notice on thread ${thread.id}:`, error);
    }
  }

  // If the provider or model the sender chose has since gone, their default runs it instead.
  async #modelForRestart(sender: NonNullable<Channel["lastSender"]>) {
    try {
      return await this.#resolveModel(sender.userId, sender.selection);
    } catch {
      return this.#resolveModel(sender.userId);
    }
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
        return { messages: run.messages, running: true };
      }
      const messages = messagesToChat(
        await this.#store.load({ scope: this.#scope(channel.thread) }),
      );
      if (channel.run) continue;
      queue.length = 0;
      return { messages, running: false };
    }
  }

  #emit(channel: Channel, event: RunEvent) {
    if (channel.run) channel.run.messages = applyEvent(channel.run.messages, event);
    for (const subscriber of channel.subscribers) subscriber(event);
  }

  async #consume(channel: Channel, run: ActiveRun) {
    let failure: string | undefined;
    try {
      for await (const event of run.handle.events) this.#emit(channel, event);
      const outcome = await run.handle.result;
      if (outcome.type !== "response") failure = `Run ended without a response (${outcome.type})`;
    } catch (error) {
      failure = errorMessage(error);
    }
    // A run the user cancelled ends quietly, whatever the runtime reported.
    const ended: RunEvent =
      failure === undefined || run.cancelled
        ? { type: "done" }
        : { type: "error", message: failure };
    this.#finish(channel, run, ended);
  }

  #finish(channel: Channel, run: ActiveRun, event: RunEvent) {
    this.#emit(channel, event);
    if (channel.run === run) channel.run = undefined;
    Promise.resolve(this.#onRunFinished(channel.thread)).catch((error) => {
      console.warn(`Could not update thread ${channel.thread.id} after its run:`, error);
    });
  }
}

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > 300 ? `${message.slice(0, 300)}…` : message;
}

export const runsService = new RunManager({
  store: memoryStore,
  runtime: new RemoteRuntime(runtimeHub, runGateway),
  resolveModel: (userId, selection) => providersService.resolveModel(userId, selection),
  onRunFinished: (thread) => threadsService.touch(thread.id),
});
