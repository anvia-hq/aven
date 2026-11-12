import { parseAgentContinuation } from "@anvia/core/agent/interactions";
import { z } from "zod";

import { environmentModel } from "../providers/resolve-model";
import type { RunGateway } from "../runtimes/gateway";
import {
  BackendUnavailableError,
  RuntimeOfflineError,
  type RuntimeConnection,
  type RuntimeHub,
} from "../runtimes/hub";
import { reachRunner } from "../runtimes/providers";
import { LOCAL_RUNTIME_ID } from "../runtimes/service";
import { runIdentities, type RunIdentities } from "../workload-identity/grants";
import type {
  Placement,
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
  RunIdentityCredential,
  RunModel,
  RunOutcome,
  RunSecrets,
  RunThreadInfo,
} from "@aven/protocol/types";

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
    private agentOnControlPlane = true,
  ) {}

  async start({
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
    claudeToken,
    claudeModel,
    codexLogin,
    codexModel,
  }: StartRunInput): Promise<RuntimeRun> {
    const extras = {
      skills,
      mcp,
      identity,
      memory,
      cockpit,
      github,
      env,
      claudeToken,
      codexLogin,
      codexModel,
    };
    return this.#launch(thread, model, extras, undefined, (runId, runModel, credential, placed) => {
      const message: Extract<ControlPlaneToRuntime, { type: "run.start" }> = {
        type: "run.start",
        runId,
        thread: placed,
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
        backend: threadBackend(thread),
      };

      if (runModel) message.model = runModel;

      if (claudeToken) message.claudeToken = claudeToken;

      if (claudeModel) message.claudeModel = claudeModel;

      if (codexLogin) message.codexLogin = codexLogin;

      if (codexModel) message.codexModel = codexModel;

      return message;
    });
  }

  async resume({
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
    claudeToken,
    claudeModel,
    codexLogin,
    codexModel,
  }: ResumeRunInput): Promise<RuntimeRun> {
    const extras = {
      skills,
      mcp,
      identity,
      memory,
      cockpit,
      github,
      env,
      claudeToken,
      codexLogin,
      codexModel,
    };
    return this.#launch(
      thread,
      model,
      extras,
      askedBy(continuation),
      (runId, runModel, credential, placed) => {
        const message: Extract<ControlPlaneToRuntime, { type: "run.resume" }> = {
          type: "run.resume",
          runId,
          thread: placed,
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
          model: runModel,
          backend: threadBackend(thread),
        };

        if (claudeToken) message.claudeToken = claudeToken;

        if (claudeModel) message.claudeModel = claudeModel;

        if (codexLogin) message.codexLogin = codexLogin;

        if (codexModel) message.codexModel = codexModel;

        return message;
      },
    );
  }

  async #launch(
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
      claudeToken,
      codexLogin,
      codexModel,
    }: Pick<
      StartRunInput,
      | "skills"
      | "mcp"
      | "identity"
      | "memory"
      | "cockpit"
      | "github"
      | "env"
      | "claudeToken"
      | "codexLogin"
      | "codexModel"
    >,
    tokenOf: string | undefined,
    message: (
      runId: string,
      runModel: RunModel | undefined,
      credential: RunIdentityCredential | undefined,
      placed: RunThreadInfo,
    ) => ControlPlaneToRuntime,
  ): Promise<RuntimeRun> {
    const { connection, hostId, machine } = await this.#placementFor(thread);
    const placed = forkable(thread, machine);
    const runId = crypto.randomUUID();
    const backend = threadBackend(thread);
    const runModel =
      backend === "claude" || backend === "codex"
        ? undefined
        : this.gateway.issue(runId, model ?? environmentModel(), thread.id, tokenOf);
    const queue = new EventQueue();
    const result = Promise.withResolvers<RunResult>();
    result.promise.catch(() => undefined);

    const credential = identity && { credential: this.identities.issue(runId, identity) };
    connection.startRun(
      runId,
      placed,
      this.#sink(runId, queue, result),
      skills?.map((skill) => skill.digest),
      mcp?.map((server) => server.id),
      memory?.caller,
      cockpit,
      keptSecrets(github, env, credential, mcp, claudeToken, codexLogin, codexModel),
    );
    this.#post(connection, runId, message(runId, runModel, credential, placed));

    return {
      events: queue,
      result: result.promise,
      cancel: (reason) => this.hub.cancelRun(hostId, runId, reason),
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

  async #placementFor(thread: RunThread): Promise<Placement> {
    const backend = threadBackend(thread);

    if (this.agentOnControlPlane && backend === "native" && thread.runtimeId !== LOCAL_RUNTIME_ID) {
      const connection = this.hub.get(LOCAL_RUNTIME_ID);

      if (!connection)
        throw new RuntimeOfflineError("The control plane's own runner is not running");

      if (!connection.offers(backend)) throw new BackendUnavailableError();

      return { connection, hostId: LOCAL_RUNTIME_ID, machine: thread.runtimeId };
    }

    const connection = await reachRunner(this.hub, {
      runtimeId: thread.runtimeId,
      threadId: thread.id,
    });

    if (!connection.offers(backend)) throw new BackendUnavailableError();

    return { connection, hostId: thread.runtimeId };
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

function keptSecrets(
  github: StartRunInput["github"],
  env: StartRunInput["env"],
  identity: RunIdentityCredential | undefined,
  mcp: StartRunInput["mcp"],
  claudeToken: string | undefined,
  codexLogin: string | undefined,
  codexModel: string | undefined,
): RunSecrets {
  const secrets: RunSecrets = {
    github,
    env: env?.length ? env : undefined,
    identity,
    mcp: mcp?.length ? mcp : undefined,
  };

  if (claudeToken) secrets.claudeToken = claudeToken;

  if (codexLogin) secrets.codexLogin = codexLogin;

  if (codexModel) secrets.codexModel = codexModel;

  return secrets;
}

function threadBackend(thread: RunThread) {
  return thread.agentBackend ?? "native";
}

function askedBy(continuation: unknown) {
  try {
    return ASKING_AGENT.exec(parseAgentContinuation(continuation).agentId)?.[1];
  } catch {
    return undefined;
  }
}

function forkable(thread: RunThread, machine?: string): RunThreadInfo {
  return {
    id: thread.id,
    organizationId: thread.organizationId,
    forkOf: thread.parentThreadId ?? undefined,
    projectId: thread.projectId,
    ownerId: thread.createdBy,
    machine,
  };
}
