import type { RunEvent } from "@aven/protocol/events";
import type {
  ControlPlaneToRuntime,
  RunIdentityCredential,
  RunModel,
  RunOutcome,
  RunThreadInfo,
} from "@aven/protocol/runtime-wire";
import type { ModelConfig } from "@aven/agents/model";
import { z } from "zod";

import { environmentModel } from "../providers/resolve-model";
import type { RunGateway } from "../runtimes/gateway";
import { RuntimeOfflineError, type RuntimeConnection, type RuntimeHub } from "../runtimes/hub";
import { runIdentities, type RunIdentities } from "../workload-identity/grants";
import type {
  ResumeRunInput,
  Runtime,
  RunResult,
  RunThread,
  RuntimeRun,
  StartRunInput,
} from "./runtime";

const STEER_TIMEOUT_MS = 10_000;

const steerResult = z.discriminatedUnion("status", [
  z.object({ status: z.literal("queued") }),
  z.object({ status: z.literal("closed") }),
  z.object({ status: z.literal("refused"), reason: z.string().max(500) }),
]);

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

export class RemoteRuntime implements Runtime {
  constructor(
    private hub: RuntimeHub,
    private gateway: Pick<RunGateway, "issue" | "revoke">,
    private identities: Pick<RunIdentities, "issue" | "revoke"> = runIdentities,
  ) {}

  start({
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
    model,
  }: StartRunInput): RuntimeRun {
    const extras = { skills, mcp, identity, memory, cockpit };
    return this.#launch(thread, model, extras, (runId, runModel, credential) => ({
      type: "run.start",
      runId,
      thread: forkable(thread),
      prompt,
      compact: compact || undefined,
      attachments: attachments?.length ? attachments : undefined,
      mentions: mentions?.length ? mentions : undefined,
      skills: skills?.length ? skills : undefined,
      mcp: mcp?.length ? mcp : undefined,
      github,
      env: env?.length ? env : undefined,
      identity: credential,
      memory: memory?.index,
      cockpit: cockpit?.access,
      model: runModel,
    }));
  }

  resume({
    thread,
    continuation,
    response,
    skills,
    mcp,
    github,
    env,
    identity,
    memory,
    cockpit,
    model,
  }: ResumeRunInput): RuntimeRun {
    const extras = { skills, mcp, identity, memory, cockpit };
    return this.#launch(thread, model, extras, (runId, runModel, credential) => ({
      type: "run.resume",
      runId,
      thread: forkable(thread),
      continuation,
      response,
      skills: skills?.length ? skills : undefined,
      mcp: mcp?.length ? mcp : undefined,
      github,
      env: env?.length ? env : undefined,
      identity: credential,
      memory: memory?.index,
      cockpit: cockpit?.access,
      model: runModel,
    }));
  }

  #launch(
    thread: RunThread,
    model: ModelConfig | undefined,
    {
      skills,
      mcp,
      identity,
      memory,
      cockpit,
    }: Pick<StartRunInput, "skills" | "mcp" | "identity" | "memory" | "cockpit">,
    message: (
      runId: string,
      runModel: RunModel,
      credential: RunIdentityCredential | undefined,
    ) => ControlPlaneToRuntime,
  ): RuntimeRun {
    const connection = this.#connectionFor(thread);
    const runId = crypto.randomUUID();
    const runModel = this.gateway.issue(runId, model ?? environmentModel(), thread.id);
    const queue = new EventQueue();
    const result = Promise.withResolvers<RunResult>();
    result.promise.catch(() => undefined);

    connection.startRun(
      runId,
      thread,
      this.#sink(runId, queue, result),
      skills?.map((skill) => skill.digest),
      mcp?.map((server) => server.id),
      memory?.caller,
      cockpit,
    );
    const credential = identity && { credential: this.identities.issue(runId, identity) };
    this.#post(connection, runId, message(runId, runModel, credential));

    return {
      events: queue,
      result: result.promise,
      cancel: (reason) => this.hub.cancelRun(thread.runtimeId, runId, reason),
      steer: async ({ id, prompt, mentions }) =>
        steerResult.parse(
          await connection.call(
            "run.steer",
            { runId, steerId: id, prompt, mentions },
            STEER_TIMEOUT_MS,
          ),
        ),
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

function forkable(thread: RunThread): RunThreadInfo {
  return {
    id: thread.id,
    organizationId: thread.organizationId,
    forkOf: thread.parentThreadId ?? undefined,
  };
}
