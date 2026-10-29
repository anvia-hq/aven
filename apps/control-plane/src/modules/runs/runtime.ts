import {
  createCodingAgent,
  type CodingAgent,
  type CodingAgentStream,
} from "@aven/agents/coding-agent";
import { formatJobNotice, JobRegistry } from "@aven/agents/jobs/job-registry";
import type { MemoryStore } from "@anvia/core";
import type { MemoryStore as PostgresMemoryStore } from "@aven/agents/memory";
import type { ModelConfig, Provider } from "@aven/agents/model";
import { projectStreamEvent } from "@aven/agents/projection";
import type { RunEvent } from "@aven/protocol/events";

export type RunThread = {
  id: string;
  organizationId: string;
  projectPath: string;
  /** The runtime the project lives on; null or absent means the control plane's own machine. */
  runtimeId?: string | null;
};

// One agent run as the control plane sees it. Everything a run needs from the machine it runs on
// (the agent loop, its tools, the shell, the project's files) stays behind this handle, so a
// remote runtime can later implement it without RunManager changing (decision 0008).
export type RuntimeRun = {
  /** The run's progress as protocol events; ends when the run does. */
  events: AsyncIterable<RunEvent>;
  /** How the run ended; `type` is "response" for a normal finish. */
  result: Promise<{ type: string }>;
  cancel(reason: string): void;
  /** Delivers a message into the live run; throws if it has just ended. */
  steer(prompt: string): void;
};

export interface Runtime {
  /**
   * Starts a run. Throws synchronously on a setup error (such as a missing API key), before
   * anything is persisted. `model` is the sender's provider; undefined means the environment's.
   */
  start(input: { thread: RunThread; prompt: string; model?: ModelConfig }): RuntimeRun;
  /** Kills the background commands a thread started. */
  stopJobs(thread: RunThread): Promise<void>;
  /** Called when a background command finishes with a notice for the agent; returns an unsubscribe. */
  onJobNotice(listener: (threadId: string, notice: string) => void): () => void;
  dispose(): Promise<void>;
  killAllNow(): void;
}

export type CreateAgent = (
  thread: RunThread,
  jobs: JobRegistry,
  memory: MemoryStore,
  /** The sender's provider; undefined means fall back to the environment. */
  model?: ModelConfig,
) => { agent: Pick<CodingAgent, "stream"> };

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

async function* projected(stream: CodingAgentStream): AsyncGenerator<RunEvent> {
  for await (const event of stream) {
    const next = projectStreamEvent(event);
    if (next) yield next;
  }
}

// Runs the agent inside the control-plane process, on its own disk. The conversation is persisted
// by the agent through `store`; moving that to the control plane is part of the remote runtime.
export class BuiltinRuntime implements Runtime {
  #jobs = new Map<string, JobRegistry>();
  #listeners = new Set<(threadId: string, notice: string) => void>();
  #disposed = false;

  constructor(
    private store: PostgresMemoryStore,
    private createAgent: CreateAgent = defaultCreateAgent,
  ) {}

  start({
    thread,
    prompt,
    model,
  }: {
    thread: RunThread;
    prompt: string;
    model?: ModelConfig;
  }): RuntimeRun {
    const jobs = this.#jobsFor(thread.id);
    const { agent } = this.createAgent(thread, jobs, this.store, model);
    const stream = agent.stream({
      prompt,
      session: { sessionId: thread.id, metadata: { organizationId: thread.organizationId } },
    });
    return {
      events: projected(stream),
      // Read lazily: asking for the result before the events are consumed changes how the stream runs.
      get result() {
        return stream.result;
      },
      cancel: (reason) => stream.cancel(reason),
      steer: (message) => stream.steer({ prompt: message }),
    };
  }

  async stopJobs(thread: RunThread) {
    const jobs = this.#jobs.get(thread.id);
    if (!jobs) return;
    await Promise.all(
      jobs
        .list()
        .filter((job) => job.status === "running")
        .map((job) => jobs.kill(job.id)),
    );
  }

  onJobNotice(listener: (threadId: string, notice: string) => void) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async dispose() {
    this.#disposed = true;
    await Promise.all([...this.#jobs.values()].map((jobs) => jobs.disposeAll()));
  }

  killAllNow() {
    for (const jobs of this.#jobs.values()) jobs.killAllNow();
  }

  #jobsFor(threadId: string) {
    let jobs = this.#jobs.get(threadId);
    if (jobs) return jobs;
    jobs = new JobRegistry();
    jobs.onComplete((job) => {
      // A killed job was stopped on purpose (by the agent, a Stop, or shutdown): nothing to report.
      if (!job.background || job.status === "killed" || this.#disposed) return;
      const notice = formatJobNotice(job);
      for (const listener of this.#listeners) listener(threadId, notice);
    });
    this.#jobs.set(threadId, jobs);
    return jobs;
  }
}
