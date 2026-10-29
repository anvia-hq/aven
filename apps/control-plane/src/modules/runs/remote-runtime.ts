import type { RunEvent } from "@aven/protocol/events";
import type { ControlPlaneToRuntime } from "@aven/protocol/runtime-wire";

import { environmentModel, type RunGateway } from "../runtimes/gateway";
import { RuntimeOfflineError, type RuntimeConnection, type RuntimeHub } from "../runtimes/hub";
import type { Runtime, RunThread, RuntimeRun, StartRunInput } from "./runtime";

type RunResult = { type: string };

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

  start({ thread, prompt, model }: StartRunInput): RuntimeRun {
    const connection = this.#connectionFor(thread);
    const runId = crypto.randomUUID();
    // Throws before anything starts if the model cannot be used (no key); the runtime gets a token, not the key.
    const runModel = this.gateway.issue(runId, model ?? environmentModel());
    const queue = new EventQueue();
    const result = Promise.withResolvers<RunResult>();
    // A run nobody awaits (cancelled early) must not surface as an unhandled rejection.
    result.promise.catch(() => undefined);

    connection.startRun(runId, thread, this.#sink(runId, queue, result));
    this.#post(connection, runId, {
      type: "run.start",
      runId,
      thread: { id: thread.id, organizationId: thread.organizationId },
      prompt,
      model: runModel,
    });

    return {
      events: queue,
      result: result.promise,
      cancel: (reason) => {
        if (connection.hasRun(runId)) connection.post({ type: "run.cancel", runId, reason });
      },
    };
  }

  dispose() {
    this.hub.closeAll();
  }

  #connectionFor(thread: RunThread) {
    const connection = this.hub.get(thread.runtimeId);
    if (!connection) throw new RuntimeOfflineError();
    return connection;
  }

  // What the connection reports back: events feed the queue, and the run's end (or loss) settles
  // the result and ends the model grant.
  #sink(runId: string, queue: EventQueue, result: PromiseWithResolvers<RunResult>) {
    return {
      event: (event: RunEvent) => queue.push(event),
      end: (outcome: string, error?: string) => {
        this.gateway.revoke(runId);
        queue.close();
        if (error) result.reject(new Error(error));
        else result.resolve({ type: outcome });
      },
      lost: (error: Error) => {
        this.gateway.revoke(runId);
        queue.fail(error);
        result.reject(error);
      },
    };
  }

  #post(connection: RuntimeConnection, runId: string, message: ControlPlaneToRuntime) {
    try {
      connection.post(message);
    } catch (error) {
      this.gateway.revoke(runId);
      connection.endRun(runId);
      throw error;
    }
  }
}
