import type { RunEvent } from "@aven/protocol/events";
import type {
  ControlPlaneToRuntime,
  RunIdentityCredential,
  RunModel,
  RunOutcome,
  RunSkill,
} from "@aven/protocol/runtime-wire";
import type { ModelConfig } from "@aven/agents/model";

import { environmentModel, type RunGateway } from "../runtimes/gateway";
import { RuntimeOfflineError, type RuntimeConnection, type RuntimeHub } from "../runtimes/hub";
import { runIdentities, type RunIdentities, type RunIdentity } from "../workload-identity/grants";
import type {
  ResumeRunInput,
  Runtime,
  RunResult,
  RunThread,
  RuntimeRun,
  StartRunInput,
} from "./runtime";

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
    private identities: Pick<RunIdentities, "issue" | "revoke"> = runIdentities,
  ) {}

  start({
    thread,
    prompt,
    attachments,
    mentions,
    skills,
    github,
    env,
    identity,
    model,
  }: StartRunInput): RuntimeRun {
    return this.#launch(thread, model, skills, identity, (runId, runModel, credential) => ({
      type: "run.start",
      runId,
      thread: { id: thread.id, organizationId: thread.organizationId },
      prompt,
      attachments: attachments?.length ? attachments : undefined,
      mentions: mentions?.length ? mentions : undefined,
      skills: skills?.length ? skills : undefined,
      github,
      env: env?.length ? env : undefined,
      identity: credential,
      model: runModel,
    }));
  }

  resume({
    thread,
    continuation,
    response,
    skills,
    github,
    env,
    identity,
    model,
  }: ResumeRunInput): RuntimeRun {
    return this.#launch(thread, model, skills, identity, (runId, runModel, credential) => ({
      type: "run.resume",
      runId,
      thread: { id: thread.id, organizationId: thread.organizationId },
      continuation,
      response,
      skills: skills?.length ? skills : undefined,
      github,
      env: env?.length ? env : undefined,
      identity: credential,
      model: runModel,
    }));
  }

  #launch(
    thread: RunThread,
    model: ModelConfig | undefined,
    skills: RunSkill[] | undefined,
    identity: RunIdentity | undefined,
    message: (
      runId: string,
      runModel: RunModel,
      credential: RunIdentityCredential | undefined,
    ) => ControlPlaneToRuntime,
  ): RuntimeRun {
    const connection = this.#connectionFor(thread);
    const runId = crypto.randomUUID();
    // Throws before anything starts if the model cannot be used (no key); the runtime gets a token, not the key.
    const runModel = this.gateway.issue(runId, model ?? environmentModel(), thread.id);
    const queue = new EventQueue();
    const result = Promise.withResolvers<RunResult>();
    // A run nobody awaits (cancelled early) must not surface as an unhandled rejection.
    result.promise.catch(() => undefined);

    connection.startRun(
      runId,
      thread,
      this.#sink(runId, queue, result),
      skills?.map((skill) => skill.digest),
    );
    const credential = identity && { credential: this.identities.issue(runId, identity) };
    this.#post(connection, runId, message(runId, runModel, credential));

    return {
      events: queue,
      result: result.promise,
      cancel: (reason) => this.hub.cancelRun(thread.runtimeId, runId, reason),
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
      end: (outcome: RunOutcome, error?: string, continuation?: unknown) => {
        this.#revoke(runId);
        queue.close();
        if (error) result.reject(new Error(error));
        else result.resolve({ type: outcome, continuation });
      },
      lost: (error: Error) => {
        this.#revoke(runId);
        queue.fail(error);
        result.reject(error);
      },
    };
  }

  #revoke(runId: string) {
    this.gateway.revoke(runId);
    this.identities.revoke(runId);
  }

  #post(connection: RuntimeConnection, runId: string, message: ControlPlaneToRuntime) {
    try {
      connection.post(message);
    } catch (error) {
      this.#revoke(runId);
      connection.endRun(runId);
      throw error;
    }
  }
}
