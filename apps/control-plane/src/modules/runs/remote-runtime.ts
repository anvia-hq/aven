import type { ModelConfig } from "@aven/agents/model";
import type { RunEvent } from "@aven/protocol/events";

import { environmentModel, type RunGateway } from "../runtimes/gateway";
import { RuntimeOfflineError, type RuntimeHub } from "../runtimes/hub";
import type { Runtime, RunThread, RuntimeRun } from "./runtime";

// A minimal async queue: `events` for a run is fed by the connection and consumed by RunManager.
class EventQueue implements AsyncIterable<RunEvent> {
  #items: RunEvent[] = [];
  #waiting: (() => void) | undefined;
  #done = false;
  #failure: Error | undefined;

  push(event: RunEvent) {
    this.#items.push(event);
    this.#wake();
  }

  close() {
    this.#done = true;
    this.#wake();
  }

  fail(error: Error) {
    this.#failure = error;
    this.close();
  }

  #wake() {
    this.#waiting?.();
    this.#waiting = undefined;
  }

  async *[Symbol.asyncIterator]() {
    for (;;) {
      const item = this.#items.shift();
      if (item) {
        yield item;
        continue;
      }
      if (this.#failure) throw this.#failure;
      if (this.#done) return;
      await new Promise<void>((resolve) => {
        this.#waiting = resolve;
      });
    }
  }
}

// Runs the agent on a runtime that is connected to this control plane (decision 0008).
export class RemoteRuntime implements Runtime {
  constructor(
    private hub: RuntimeHub,
    private gateway: Pick<RunGateway, "issue" | "revoke">,
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
    const connection = thread.runtimeId ? this.hub.get(thread.runtimeId) : undefined;
    if (!connection) throw new RuntimeOfflineError();

    const runId = crypto.randomUUID();
    // Throws before anything starts if the model cannot be used (no key); the runtime gets a token, not the key.
    const runModel = this.gateway.issue(runId, model ?? environmentModel());
    const queue = new EventQueue();
    let settle!: { resolve: (value: { type: string }) => void; reject: (error: Error) => void };
    const result = new Promise<{ type: string }>((resolve, reject) => {
      settle = { resolve, reject };
    });
    // A run nobody awaits (cancelled early) must not surface as an unhandled rejection.
    result.catch(() => undefined);

    connection.startRun(runId, thread, {
      event: (event) => queue.push(event),
      end: (outcome, error) => {
        this.gateway.revoke(runId);
        queue.close();
        if (error) settle.reject(new Error(error));
        else settle.resolve({ type: outcome });
      },
      lost: (error) => {
        this.gateway.revoke(runId);
        queue.fail(error);
        settle.reject(error);
      },
    });
    try {
      connection.post({
        type: "run.start",
        runId,
        thread: {
          id: thread.id,
          organizationId: thread.organizationId,
          projectPath: thread.projectPath,
        },
        prompt,
        model: runModel,
      });
    } catch (error) {
      this.gateway.revoke(runId);
      connection.endRun(runId);
      throw error;
    }

    return {
      events: queue,
      get result() {
        return result;
      },
      cancel: (reason) => {
        if (connection.hasRun(runId)) connection.post({ type: "run.cancel", runId, reason });
      },
      steer: (message) => {
        if (!connection.hasRun(runId)) throw new Error("The run has ended");
        connection.post({ type: "run.steer", runId, prompt: message });
      },
    };
  }

  async stopJobs(thread: RunThread) {
    const connection = thread.runtimeId ? this.hub.get(thread.runtimeId) : undefined;
    connection?.post({ type: "jobs.stop", threadId: thread.id });
  }

  onJobNotice(listener: (threadId: string, notice: string) => void) {
    return this.hub.onJobNotice(listener);
  }

  async dispose() {
    this.hub.closeAll();
  }

  killAllNow() {}
}
