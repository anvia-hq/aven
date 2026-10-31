import {
  assertAgentInteractionResponse,
  parseAgentContinuation,
} from "@anvia/core/agent/interactions";
import type { ConversationStore } from "@aven/agents/memory";
import type { ModelConfig } from "@aven/agents/model";
import { messagesToChat, usageFromHistory } from "@aven/agents/projection";
import {
  applyEvent,
  applyUsage,
  type ChatMessage,
  type MessageAttachment,
  type QuestionAnswer,
  type RunEvent,
  type ThreadUsage,
} from "@aven/protocol/events";
import type { RunAttachment, RunEnvVar, RunGithub, RunSkill } from "@aven/protocol/runtime-wire";

import { ConflictError, describeError, UnavailableError, UnprocessableError } from "../../errors";
import { memoryStore } from "../../memory-store";
import { syncPullRequest } from "../threads/pull-request";
import { threadsService } from "../threads/service";
import type { RunExtras, Runtime, RunThread, RuntimeRun } from "./runtime";
import { RemoteRuntime } from "./remote-runtime";
import { runGateway } from "../runtimes/gateway";
import { runtimeHub } from "../runtimes/hub";

type ActiveRun = {
  handle: RuntimeRun;
  /** The whole transcript so far: history plus this run, kept current by applying events. */
  messages: ChatMessage[];
  /** What the thread has used: its history plus this run, kept current like `messages`. */
  usage: ThreadUsage;
  cancelled: boolean;
  /** Settles once history has been loaded into `messages` (or failed to); never rejects. */
  ready: Promise<void>;
};

type Channel = {
  thread: RunThread;
  subscribers: Set<(event: RunEvent) => void>;
  run?: ActiveRun;
};

export type ContinuationStore = {
  save(threadId: string, continuation: unknown): Promise<void>;
  clear(threadId: string): Promise<void>;
};

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
  #onRunFinished: (thread: RunThread) => void | Promise<void>;
  #continuations: ContinuationStore;

  constructor(deps: {
    store: ConversationStore;
    /** Where runs execute. */
    runtime: Runtime;
    /** Called after every run, e.g. to bump the thread in the list. */
    onRunFinished: (thread: RunThread) => void | Promise<void>;
    /** Where a run that stopped on the agent's question waits for the answer. */
    continuations: ContinuationStore;
  }) {
    this.#store = deps.store;
    this.#onRunFinished = deps.onRunFinished;
    this.#runtime = deps.runtime;
    this.#continuations = deps.continuations;
  }

  isRunning(threadId: string) {
    return this.#channels.get(threadId)?.run !== undefined;
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
    { attachments = [], mentions = [], skills = [], github, env }: RunExtras = {},
  ) {
    const channel = this.#channel(thread);
    if (channel.run) throw new RunBusyError();

    const handle = this.#runtime.start({
      thread,
      prompt,
      attachments,
      mentions,
      skills,
      github,
      env,
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
    skills: RunSkill[] = [],
    github?: RunGithub,
    env?: RunEnvVar[],
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
      github,
      env,
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
      ready: Promise.resolve(),
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
      handle.cancel("history load failed");
      console.warn(`Could not load the history of thread ${thread.id}:`, error);
      throw new UnavailableError("The thread's history could not be loaded; try again shortly");
    }
    this.#emit(channel, opening);
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
        return { messages: run.messages, running: true, usage: run.usage };
      }
      const history = await this.#store.load({ scope: this.#scope(channel.thread) });
      if (channel.run) continue;
      queue.length = 0;
      return {
        messages: messagesToChat(history),
        running: false,
        usage: usageFromHistory(history),
      };
    }
  }

  #emit(channel: Channel, event: RunEvent) {
    const { run } = channel;
    if (run) run.messages = applyEvent(run.messages, event);
    if (event.type === "usage" && run) run.usage = applyUsage(run.usage, event);
    for (const subscriber of channel.subscribers) subscriber(event);
  }

  async #consume(channel: Channel, run: ActiveRun) {
    let failure: string | undefined;
    try {
      for await (const event of run.handle.events) this.#emit(channel, event);
      const outcome = await run.handle.result;
      if (outcome.type === "interaction") await this.#suspend(channel.thread, outcome.continuation);
      else if (outcome.type !== "response") {
        failure = `Run ended without a response (${outcome.type})`;
      }
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

  // The agent asked a question: its run ends here, and what resumes it is kept until it is answered.
  // The question itself is in the transcript, which the run's events and the history both carry.
  async #suspend(thread: RunThread, continuation: unknown) {
    const saved = parseSaved(continuation);
    if (saved.interaction.type !== "tool-question") {
      throw new Error(`Run stopped on an unsupported interaction (${saved.interaction.type})`);
    }
    await this.#continuations.save(thread.id, saved);
  }

  #finish(channel: Channel, run: ActiveRun, event: RunEvent) {
    this.#emit(channel, event);
    if (channel.run === run) channel.run = undefined;
    Promise.resolve(this.#onRunFinished(channel.thread)).catch((error) => {
      console.warn(`Could not update thread ${channel.thread.id} after its run:`, error);
    });
  }
}

// A runtime is not trusted, and a stored continuation outlives the process that wrote it.
function parseSaved(continuation: unknown) {
  try {
    return parseAgentContinuation(continuation);
  } catch {
    throw new ConflictError("The agent's question can no longer be answered; send a new message");
  }
}

function withoutBytes({ name, mediaType, size, image }: RunAttachment): MessageAttachment {
  return image ? { name, mediaType, size, image } : { name, mediaType, size };
}

function errorMessage(error: unknown) {
  const message = describeError(error);
  return message.length > 300 ? `${message.slice(0, 300)}…` : message;
}

export const runsService = new RunManager({
  store: memoryStore,
  runtime: new RemoteRuntime(runtimeHub, runGateway),
  onRunFinished: async (thread) => {
    await threadsService.touch(thread.id);
    // The agent may have opened the thread's pull request (decision 0044); the badge learns of it here.
    await syncPullRequest(thread).catch((error: unknown) => {
      console.warn(
        `Could not look for the pull request of thread ${thread.id}:`,
        describeError(error),
      );
    });
  },
  continuations: {
    save: (threadId, continuation) => threadsService.saveContinuation(threadId, continuation),
    clear: (threadId) => threadsService.clearContinuation(threadId),
  },
});
