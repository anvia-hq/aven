import { db } from "@aven/db/client";
import {
  createCodingAgent,
  type CodingAgent,
  type CodingAgentStream,
} from "@aven/agents/coding-agent";
import { formatJobNotice, JobRegistry } from "@aven/agents/jobs/job-registry";
import { createMemoryStore, type MemoryStore } from "@aven/agents/memory";
import { messagesToChat, projectStreamEvent } from "@aven/agents/projection";
import { applyEvent, type ChatMessage, type RunEvent } from "@aven/agents/protocol";
import type { ModelConfig, Provider } from "@aven/agents/model";

import { providersService } from "../providers/service";
import { threadsService } from "../threads/service";

export type RunThread = { id: string; organizationId: string; projectPath: string };

type CreateAgent = (
  thread: RunThread,
  jobs: JobRegistry,
  memory: MemoryStore,
  /** The sender's provider; undefined means fall back to the environment. */
  model?: ModelConfig,
) => { agent: Pick<CodingAgent, "stream"> };

type ActiveRun = {
  stream: CodingAgentStream;
  /** The whole transcript so far: history plus this run, kept current by applying events. */
  messages: ChatMessage[];
  cancelled: boolean;
  /** Resolves once history is loaded into `messages`; never rejects (see `loadError`). */
  ready: Promise<void>;
  loadError?: unknown;
};

type Channel = {
  thread: RunThread;
  jobs: JobRegistry;
  subscribers: Set<(event: RunEvent) => void>;
  run?: ActiveRun;
  /** Who sent the last message; a run restarted by a finished background job uses their provider. */
  lastUserId?: string;
};

export class RunBusyError extends Error {
  constructor() {
    super("A run is already in progress for this thread");
  }
}

const PING_MS = 5_000;

// The sender's own provider is used when they have one. Otherwise the environment supplies a
// shared one (AGENT_PROVIDER / AGENT_MODEL plus the matching API key).
const defaultCreateAgent: CreateAgent = (thread, jobs, memory, model) => {
  if (model) return createCodingAgent({ ...model, root: thread.projectPath, jobs, memory });
  const provider = (process.env.AGENT_PROVIDER ?? "anthropic") as Provider;
  if (provider !== "openai" && provider !== "anthropic") {
    throw new Error(`AGENT_PROVIDER must be "openai" or "anthropic", got "${provider}"`);
  }
  return createCodingAgent({
    provider,
    modelId: process.env.AGENT_MODEL || undefined,
    root: thread.projectPath,
    jobs,
    memory,
  });
};

// Runs belong to the server, not to an HTTP request: a client can disconnect, reload or never
// connect at all (a background job finishing starts a run with nobody watching) and the agent
// keeps working. Clients attach with `events()` and get a snapshot, then live events.
export class RunManager {
  #channels = new Map<string, Channel>();
  #disposed = false;
  #store: MemoryStore;
  #createAgent: CreateAgent;
  #resolveModel: ((userId: string) => Promise<ModelConfig | null>) | undefined;
  #onRunFinished: ((thread: RunThread) => void | Promise<void>) | undefined;

  constructor(deps: {
    store: MemoryStore;
    createAgent?: CreateAgent;
    /** Looks up a user's provider when a background job restarts a run on their behalf. */
    resolveModel?: (userId: string) => Promise<ModelConfig | null>;
    /** Called after every run, e.g. to bump the thread in the list. */
    onRunFinished?: (thread: RunThread) => void | Promise<void>;
  }) {
    this.#store = deps.store;
    this.#onRunFinished = deps.onRunFinished;
    this.#createAgent = deps.createAgent ?? defaultCreateAgent;
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
    sender?: { userId: string; model?: ModelConfig | null },
  ) {
    const channel = this.#channel(thread);
    if (channel.run) throw new RunBusyError();
    if (sender) channel.lastUserId = sender.userId;

    const scope = this.#scope(thread);
    const agent = this.#createAgent(
      thread,
      channel.jobs,
      this.#store,
      sender?.model ?? undefined,
    ).agent;
    // Claim the slot before the first await so two concurrent starts cannot both proceed.
    const stream = agent.stream({ prompt, session: scope });
    const run: ActiveRun = { stream, messages: [], cancelled: false, ready: Promise.resolve() };
    channel.run = run;
    run.ready = this.#store.load({ scope }).then(
      (history) => {
        run.messages = messagesToChat(history);
      },
      (error) => {
        run.loadError = error;
      },
    );

    await run.ready;
    if (run.loadError !== undefined) {
      channel.run = undefined;
      stream.cancel("history load failed");
      throw run.loadError;
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
      run.stream.cancel("Cancelled by user");
    }
    for (const job of channel.jobs.list()) {
      if (job.status === "running") void channel.jobs.kill(job.id);
    }
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
  async dispose() {
    this.#disposed = true;
    for (const channel of this.#channels.values()) channel.run?.stream.cancel("Shutting down");
    await Promise.all([...this.#channels.values()].map((channel) => channel.jobs.disposeAll()));
  }

  killAllJobsNow() {
    for (const channel of this.#channels.values()) channel.jobs.killAllNow();
  }

  #scope(thread: RunThread) {
    // The organization comes from the thread row, never from the client.
    return { sessionId: thread.id, metadata: { organizationId: thread.organizationId } };
  }

  #channel(thread: RunThread): Channel {
    let channel = this.#channels.get(thread.id);
    if (channel) return channel;

    const created: Channel = {
      thread,
      jobs: new JobRegistry(),
      subscribers: new Set(),
    };
    // A background job finishing is delivered into the live run, or starts a new one if it ended.
    created.jobs.onComplete((job) => {
      // A killed job was stopped on purpose (by the agent, a Stop, or shutdown): nothing to report.
      if (!job.background || job.status === "killed" || this.#disposed) return;
      const notice = formatJobNotice(job);
      const live = created.run;
      if (live) {
        try {
          live.stream.steer({ prompt: notice });
          return;
        } catch {
          // The run just ended; fall through and start a new one.
        }
      }
      void this.#restart(created, thread, notice);
    });
    this.#channels.set(thread.id, created);
    channel = created;
    return channel;
  }

  // Starts a run for a finished background job, with the provider of whoever last sent a message.
  async #restart(channel: Channel, thread: RunThread, notice: string) {
    try {
      const userId = channel.lastUserId;
      const model = userId ? await this.#resolveModel?.(userId) : null;
      await this.start(thread, notice, userId ? { userId, model } : undefined);
    } catch {
      // Nothing is listening; the notice is lost, as it was before when start failed.
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
    try {
      for await (const event of run.stream) {
        const projected = projectStreamEvent(event);
        if (projected) this.#emit(channel, projected);
      }
      const outcome = await run.stream.result;
      if (outcome.type === "response" || run.cancelled)
        this.#finish(channel, run, { type: "done" });
      else
        this.#finish(channel, run, {
          type: "error",
          message: `Run ended without a response (${outcome.type})`,
        });
    } catch (error) {
      if (run.cancelled) this.#finish(channel, run, { type: "done" });
      else this.#finish(channel, run, { type: "error", message: errorMessage(error) });
    }
  }

  #finish(channel: Channel, run: ActiveRun, event: RunEvent) {
    this.#emit(channel, event);
    if (channel.run === run) channel.run = undefined;
    Promise.resolve(this.#onRunFinished?.(channel.thread)).catch(() => undefined);
  }
}

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > 300 ? `${message.slice(0, 300)}…` : message;
}

export const runsService = new RunManager({
  store: createMemoryStore(db),
  resolveModel: (userId) => providersService.resolveModel(userId),
  onRunFinished: (thread) => threadsService.touch(thread.id),
});
