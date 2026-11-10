import { parseAgentContinuation } from "@anvia/core/agent/interactions";
import { z } from "zod";

import { UnavailableError } from "../../errors";
import { environmentModel } from "../providers/resolve-model";
import type { RunGateway } from "../runtimes/gateway";
import { RuntimeOfflineError, type RuntimeConnection, type RuntimeHub } from "../runtimes/hub";
import { runIdentities, type RunIdentities } from "../workload-identity/grants";
import type {
  ResumeRunInput,
  RunResult,
  RunThread,
  Runtime,
  RuntimeRun,
  StartRunInput,
} from "./types";
import type { ModelConfig } from "@aven/agents/types";
import type {
  ControlPlaneToRuntime,
  RunEvent,
  RunCodex,
  RunIdentityCredential,
  RunModel,
  RunOutcome,
  RunThreadInfo,
} from "@aven/protocol/types";

const STEER_TIMEOUT_MS = 10_000;

type Routed = { model?: RunModel; codex?: RunCodex };

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
    webSearch,
    memory,
    cockpit,
    model,
  }: StartRunInput): RuntimeRun {
    const extras = { skills, mcp, identity, memory, cockpit };
    return this.#launch(thread, model, extras, undefined, (runId, routed, credential) => ({
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
      webSearch,
      memory: memory?.index,
      cockpit: cockpit?.access,
      model: routed.model,
      codex: routed.codex,
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
    webSearch,
    memory,
    cockpit,
    model,
  }: ResumeRunInput): RuntimeRun {
    const extras = { skills, mcp, identity, memory, cockpit };
    return this.#launch(
      thread,
      model,
      extras,
      askedBy(continuation),
      (runId, routed, credential) => ({
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
        webSearch,
        memory: memory?.index,
        cockpit: cockpit?.access,
        model: routed.model,
        codex: routed.codex,
      }),
    );
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
      github,
      env,
    }: Pick<StartRunInput, "skills" | "mcp" | "identity" | "memory" | "cockpit" | "github" | "env">,
    tokenOf: string | undefined,
    message: (
      runId: string,
      routed: Routed,
      credential: RunIdentityCredential | undefined,
    ) => ControlPlaneToRuntime,
  ): RuntimeRun {
    const connection = this.#connectionFor(thread);
    const runId = crypto.randomUUID();
    const routed = this.#route(connection, runId, thread, model ?? environmentModel(), tokenOf);
    const queue = new EventQueue();
    const result = Promise.withResolvers<RunResult>();
    result.promise.catch(() => undefined);

    const credential = identity && { credential: this.identities.issue(runId, identity) };
    connection.startRun(
      runId,
      thread,
      this.#sink(runId, queue, result),
      skills?.map((skill) => skill.digest),
      mcp?.map((server) => server.id),
      memory?.caller,
      cockpit,
      {
        github,
        env: env?.length ? env : undefined,
        identity: credential,
        mcp: mcp?.length ? mcp : undefined,
      },
    );
    this.#post(connection, runId, message(runId, routed, credential));

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

  #route(
    connection: RuntimeConnection,
    runId: string,
    thread: RunThread,
    model: ModelConfig,
    tokenOf: string | undefined,
  ): Routed {
    if (model.provider !== "codex") {
      return { model: this.gateway.issue(runId, model, thread.id, tokenOf) };
    }
    if (!connection.codex) {
      throw new UnavailableError("This runner has to be updated before it can run Codex");
    }
    return { codex: { modelId: model.modelId, reasoningEffort: model.reasoningEffort } };
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

const ASKING_AGENT = /^run-(.+)$/;

function askedBy(continuation: unknown) {
  try {
    return ASKING_AGENT.exec(parseAgentContinuation(continuation).agentId)?.[1];
  } catch {
    return undefined;
  }
}

function forkable(thread: RunThread): RunThreadInfo {
  return {
    id: thread.id,
    organizationId: thread.organizationId,
    forkOf: thread.parentThreadId ?? undefined,
    projectId: thread.projectId,
    ownerId: thread.createdBy,
  };
}
