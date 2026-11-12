import { createQuestionTool, type AgentPrompt, type AnyTool, type Message } from "@anvia/core";
import {
  parseAgentContinuation,
  parseAgentInteractionResponse,
} from "@anvia/core/agent/interactions";
import { sentPrompt } from "@aven/agents/attachments";
import type { ComputerHost } from "@aven/agents/tools/computer";
import type { GoalRequest } from "@aven/agents/tools/define-goal";
import { errorMessage } from "@aven/agents/values";

import { CODING_MAX_TURNS } from "@aven/agents/turn-limits";
import { createSecretRequestTool } from "@aven/agents/tools/request-secret";
import { createWebSearchTool } from "@aven/agents/tools/web-search";

import { keepAttachments, promptOf } from "./attachments";
import { codexInstructions } from "./codex-instructions";
import { verifyWith } from "./goal-assessment";
import { goalReport, goalSessionMessage } from "./goal-report";
import { redactingTools, secretRedactor } from "./secret-redaction";
import { wakingTools } from "./late-bound-tools";
import { withPlacedUploads } from "./placed-uploads";
import { createForkHost } from "./fork-host";
import { toolsForRun } from "./run-tools";
import { connectMcpServers } from "./mcp-servers";
import { connectMcpForMachine } from "./machine-mcp";
import { timing } from "./timing";
import type {
  RunMcpServer,
  RunSecrets,
  RunThreadInfo,
  RunWebSearch,
  SteerResult,
} from "@aven/protocol/types";
import type {
  AgentBackend,
  ConnectedMcp,
  DriverContext,
  DurableEnd,
  Emit,
  FollowedGoal,
  FollowedRun,
  GoalEnd,
  CodexInstructionExtras,
  RunInput,
  RunMessage,
  RunRecord,
  SteerParams,
  ThreadWorkspaces,
  Timing,
} from "./types";

type Live = {
  threadId: string;
  machine?: string;
  save(changes: Partial<RunRecord>): void;
  followed?: Pick<FollowedRun, "cancel">;
  goal?: FollowedGoal;
  cancelReason?: string;
  steers: { steerId: string; message: AgentPrompt }[];
  mcp?: ConnectedMcp;
  mcpGoing?: Promise<ConnectedMcp | undefined>;
  skillsUnavailable?: string[];
};

type RunScope = {
  readonly runId: string;
  readonly thread: RunThreadInfo;
  readonly run: Live;
  readonly clock: Timing;
  readonly backend: AgentBackend;
  readonly record: RunRecord;
  save(changes: Partial<RunRecord>): void;
  current(): readonly AnyTool[] | undefined;
  build(id: string, attended: boolean): RunInput;
  forward: Emit;
  file(messages: Message[]): Promise<void>;
  stopIfCancelled(): void;
};

const withoutPrompt = (messages: Message[]) =>
  messages[0]?.role === "user" ? messages.slice(1) : messages;

const FIRST_OUTPUT = new Set(["text", "reasoning", "tool_start"]);

const MCP_SWEEP_MS = 60_000;

const RUN_GONE = "The run is gone: this runner has no record of it";

function namedBackend(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

async function prepareRun(
  sandbox: ThreadWorkspaces,
  runId: string,
  threadId: string,
  secrets: RunSecrets | undefined,
  controlPlane: string,
) {
  const { github, identity, env } = secrets ?? {};
  await Promise.all([
    sandbox.signInGithub?.(threadId, github).catch((error: unknown) => {
      console.warn(`Run ${runId} could not sign in to GitHub:`, errorMessage(error));
    }),
    sandbox.signInIdentity?.(threadId, identity, controlPlane).catch((error: unknown) => {
      console.warn(`Run ${runId} could not sign in to mint identity tokens:`, errorMessage(error));
    }),
  ]);
  sandbox.setProjectEnv?.(threadId, env);
}

export function createRunDriver(context: DriverContext) {
  const { records, outbox, report } = context;
  const live = new Map<string, Live>();
  const activeRun = (threadId: string) =>
    [...live.values()].find((run) => run.threadId === threadId);
  const mcpConnections = new Map<string, ConnectedMcp>();
  const mcpKeys = new Map<string, string>();
  const runGoing = (threadId: string) =>
    [...live.values()].some((run) => run.threadId === threadId);
  const mcpKey = (configs: readonly RunMcpServer[]) =>
    JSON.stringify(
      [...configs]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map(({ id, name, url, headers, allowLocal }) => [
          id,
          name,
          url,
          headers ?? {},
          allowLocal,
        ]),
    );
  async function closeReleasedMcp(threadId: string) {
    for (const [id, connected] of mcpConnections) {
      if (id === threadId || context.boxes.has(id) || runGoing(id)) continue;

      mcpConnections.delete(id);
      mcpKeys.delete(id);
      await connected.close().catch(() => undefined);
    }
  }
  const sweeper = setInterval(() => {
    if (context.stopped()) return clearInterval(sweeper);

    void closeReleasedMcp("");
  }, MCP_SWEEP_MS);
  sweeper.unref();

  async function connectMcp(run: Live, runId: string, threadId: string, secrets: RunSecrets) {
    const configs = secrets.mcp ?? [];

    if (!configs.length) return undefined;

    await closeReleasedMcp(threadId);
    const key = mcpKey(configs);
    const kept = mcpConnections.get(threadId);
    let connected: ConnectedMcp;

    if (kept && mcpKeys.get(threadId) === key && kept.results.every((result) => !result.error)) {
      connected = kept;
    } else {
      if (kept) {
        mcpConnections.delete(threadId);
        mcpKeys.delete(threadId);
        await kept.close().catch(() => undefined);
      }

      connected = run.machine
        ? await connectMcpForMachine(configs, context.machineCall?.(threadId))
        : await connectMcpServers(configs);
      mcpConnections.set(threadId, connected);
      mcpKeys.set(threadId, key);
    }

    run.mcp = connected;
    context.call("mcp.report", { runId, results: connected.results }).catch((error: unknown) => {
      console.warn(`Run ${runId} could not report on its MCP servers:`, errorMessage(error));
    });
    return connected;
  }

  async function execute(
    initial: RunRecord,
    message?: RunMessage,
    secrets: RunSecrets = message ?? {},
  ) {
    const { runId, thread } = initial;
    const clock = timing(`run ${runId}`);
    const state = { record: initial };
    const save = (changes: Partial<RunRecord>) => {
      state.record = { ...state.record, ...changes };

      if (!context.stopped()) records.save(state.record);
    };
    const run: Live = { threadId: thread.id, machine: thread.machine, save, steers: [] };
    live.set(runId, run);
    let ended: DurableEnd["type"] | undefined;
    try {
      const chosen = await context.backend(initial.backend);

      if (run.cancelReason) throw new Error(run.cancelReason);

      if (message?.type === "run.start" && message.attachments?.length) {
        save({
          attachments: await keepAttachments(context.sandbox, thread.id, message.attachments),
        });
      }

      clock.mark("attachments");
      const scope = await acquire(initial, state, run, secrets, clock, chosen);
      const end = await phases(scope, message);
      ended = run.cancelReason ? undefined : end.type;
      finish(runId, end, run.cancelReason);
    } catch (error) {
      finish(runId, { type: "error", error: errorMessage(error) });
    } finally {
      live.delete(runId);

      if (run.mcpGoing) await run.mcpGoing.catch(() => undefined);

      context.finished(thread.id, ended);
    }
  }

  async function installSkills({ runId, thread, skills = [] }: RunRecord) {
    const store = context.sandbox.skills;

    if (!store) return [];

    const fetch = async (digest: string) =>
      Uint8Array.fromBase64((await context.call("skills.get", { runId, digest })).data);
    return store.install(thread.id, skills, fetch, await context.sandbox.workspace(thread.id));
  }

  function reporting({ runId }: RunRecord, state: { record: RunRecord }, run: Live) {
    return {
      forward: ((event, source) =>
        report(runId, (seq) => ({ type: "run.event", runId, seq, event }), source)) as Emit,
      async file(messages: Message[]) {
        if (messages.length === 0) return;

        await context.call("memory.append", { runId, turn: state.record.turn, messages });
        run.save({ turn: state.record.turn + messages.length });
      },
      stopIfCancelled() {
        if (run.cancelReason) throw new Error(run.cancelReason);
      },
    };
  }

  async function compactionScope(
    initial: RunRecord,
    state: { record: RunRecord },
    run: Live,
    secrets: RunSecrets,
    clock: Timing,
    backend: AgentBackend,
  ): Promise<RunScope> {
    const { runId, thread, model } = initial;
    return {
      runId,
      thread,
      run,
      clock,
      backend,
      current: () => undefined,
      get record() {
        return state.record;
      },
      save: run.save,
      build: (id) =>
        backend.kind === "codex"
          ? codexRunInput({ secrets, compact: true, attended: false, tools: [] })
          : {
              ...context.createAgent({
                thread,
                id,
                attended: false,
                tools: [],
                model,
                compact: true,
              }),
              contextWindow: model?.contextWindow,
            },
      ...reporting(initial, state, run),
    };
  }

  async function acquire(
    initial: RunRecord,
    state: { record: RunRecord },
    run: Live,
    secrets: RunSecrets,
    clock: Timing,
    backend: AgentBackend,
  ): Promise<RunScope> {
    const { env } = secrets;
    const { runId, thread, model } = initial;

    if (initial.compact) return compactionScope(initial, state, run, secrets, clock, backend);

    const repoAccess = () => context.call("repo.access", { runId });
    const folder = () => context.call("repo.folder", { runId }).then(({ directory }) => directory);
    await context.starting(thread.id);
    run.mcpGoing = connectMcp(run, runId, thread.id, secrets);
    run.mcpGoing.catch(() => undefined);
    const box = await context.sandbox.acquire(thread, repoAccess, { lazy: true, folder });
    context.boxes.set(thread.id, box);
    let turnMarked = state.record.kind !== "start" || Boolean(state.record.durableId);
    const markCurrentTurn = async () => {
      if (turnMarked || !context.sandbox.markTurn) return;

      if (!(await context.sandbox.workspace(thread.id))) return;

      turnMarked = true;
      await context.sandbox.markTurn(thread.id).catch(() => false);
    };
    await markCurrentTurn();
    let waking: Promise<void> | undefined;
    const wake = () => {
      waking ??= (async () => {
        await box.start?.();
        clock.mark("sandbox");

        if (run.cancelReason) throw new Error(run.cancelReason);

        await prepareRun(context.sandbox, runId, thread.id, secrets, context.controlPlane);
        clock.mark("sign-in");
        await markCurrentTurn();
        clock.mark("turn");
      })().catch((error: unknown) => {
        waking = undefined;

        if (!run.machine) {
          run.cancelReason ??= errorMessage(error);
          void run.followed?.cancel();
        }

        throw error;
      });
      return waking;
    };
    const computer: ComputerHost = {
      status: async () => box.state?.() ?? "awake",
      async wake() {
        const before = box.state?.() ?? "awake";
        await wake();
        return { before, state: box.state?.() ?? "awake" };
      },
    };
    const mcp = await run.mcpGoing;
    clock.mark("mcp");

    if (run.cancelReason) throw new Error(run.cancelReason);

    if (!state.record.skillListing) {
      try {
        run.save({ skillListing: await installSkills(state.record) });
      } catch (error) {
        if (!run.machine) throw error;

        run.skillsUnavailable = (state.record.skills ?? []).map(({ name }) => name);
        console.warn(
          `No skills for ${thread.id}, its computer is unreachable:`,
          errorMessage(error),
        );
      }
    }

    clock.mark("skills");
    const redact = secretRedactor(env);
    const noted = (tools: readonly AnyTool[]) =>
      withPlacedUploads(wakingTools(tools, wake), () =>
        context.sandbox.uploads?.placedNote?.(thread.id),
      );
    const current = () => {
      const live = context.boxes.get(thread.id)?.tools;
      const tools = live && noted(live);
      return tools && redact ? redactingTools(tools, redact) : tools;
    };

    const { forward: send, file, stopIfCancelled } = reporting(initial, state, run);
    let answered = false;
    const forward = ((event, source) => {
      if (!answered && FIRST_OUTPUT.has(event.type)) {
        answered = true;
        clock.mark("first output");
      }

      send(event, source);
    }) as Emit;

    return {
      runId,
      thread,
      run,
      clock,
      backend,
      current,
      get record() {
        return state.record;
      },
      save: run.save,
      build(id, attended) {
        const skills = state.record.skillListing;
        const envNames = env?.map(({ name }) => name);
        const forking = attended && !thread.forkOf;
        const paths = context.sandbox.paths?.(thread.id);
        const listed = toolsForRun({
          sandbox: context.sandbox,
          thread,
          tools: noted(box.tools),
          computer,
          current,
          mcp: mcp && {
            tools: mcp.tools,
            current: () => mcpConnections.get(thread.id)?.tools,
          },
          attended,
          repoAccess,
          defineGoal: (goal) => activeRun(thread.id)?.save({ goal }),
          memory:
            state.record.memory &&
            (async (command) => {
              const answer = await context.call("memory.notes", {
                runId,
                command: redact ? redact(command) : command,
              });
              return redact ? redact(answer) : answer;
            }),
          cockpit:
            state.record.cockpit &&
            (async (command) => {
              const answer = await context.call("cockpit.read", { runId, command });
              return redact ? redact(answer) : answer;
            }),
          forks: forking
            ? createForkHost({
                runId,
                thread,
                sandbox: context.sandbox,
                call: context.call,
                redact,
              })
            : undefined,
          emit: (event) => forward(event),
          createSubagent:
            backend.kind === "codex"
              ? () => {
                  throw new Error("A Codex subagent is started by the Codex backend");
                }
              : ({ type, id: subagentId, tools }) =>
                  context.createAgent({
                    thread,
                    id: `${id}-${subagentId}`,
                    attended: false,
                    tools,
                    skills,
                    skillsUnavailable: run.skillsUnavailable,
                    envNames,
                    paths,
                    mcp: mcp?.note,
                    webSearch: state.record.webSearch,
                    model,
                    role: type,
                  }).agent,
        });

        if (backend.kind === "codex") {
          return codexRunInput({
            secrets,
            compact: false,
            attended,
            tools: listed,
            webSearch: state.record.webSearch,
            images: (state.record.attachments ?? []).flatMap((file) =>
              file.image && file.path.includes("/") ? [file.path] : [],
            ),
            extras: {
              skills,
              skillsUnavailable: run.skillsUnavailable,
              envNames,
              mcp: mcp?.note,
              memory: state.record.memory,
              forks: forking,
              paths,
            },
          });
        }

        const { agent, compaction } = context.createAgent({
          thread,
          id,
          attended,
          forks: forking,
          paths,
          tools: listed,
          skills,
          skillsUnavailable: run.skillsUnavailable,
          envNames,
          mcp: mcp?.note,
          memory: state.record.memory,
          webSearch: state.record.webSearch,
          model,
        });
        return { agent, compaction, contextWindow: model?.contextWindow };
      },
      forward,
      file,
      stopIfCancelled,
    };
  }

  async function phases(scope: RunScope, message?: RunMessage): Promise<DurableEnd> {
    let end: DurableEnd = { type: "response", messages: [] };

    if (scope.record.phase === "chat") end = await runChat(scope, message);

    const goal = scope.record.goal;

    if (goal && scope.record.phase === "goal") return runGoal(scope, goal);

    if (goal && scope.record.phase === "report") return reportOnGoal(scope, goal);

    return end;
  }

  async function runChat(scope: RunScope, message?: RunMessage): Promise<DurableEnd> {
    const { runId, thread, run, backend, save, build, forward } = scope;
    let followed: FollowedRun;

    if (scope.record.durableId) {
      followed = await backend.rejoin(
        scope.record.durableId,
        build(scope.record.agentId, true),
        outbox.cursor(runId, scope.record.durableId),
        forward,
      );
    } else if (scope.record.kind === "start") {
      followed = await backend.start(
        runId,
        thread.id,
        await promptOf(
          scope.record,
          context.sandbox,
          context.sandbox.paths?.(scope.record.thread.id),
        ),
        build(scope.record.agentId, true),
        forward,
      );
    } else {
      const asked = await backend.asked(thread.id);

      if (!asked) throw new Error("This thread has no question waiting for an answer");

      save({ agentId: asked.agentId });
      const resume = message?.type === "run.resume" ? message : undefined;
      const { interaction } = parseAgentContinuation(resume?.continuation);
      followed = await backend.answer(
        asked,
        interaction,
        parseAgentInteractionResponse(resume?.response),
        () => build(asked.agentId, true),
        forward,
      );
    }

    save({ durableId: followed.durableId });
    scope.clock.mark("started");
    run.followed = followed;
    await handOverSteers(run, backend, followed.durableId);

    if (run.cancelReason) void followed.cancel();

    const end = await followed.done;

    if (end.type !== "error") {
      save({ turn: backend.transcriptTurn(followed.durableId, end) });
      await scope.file(end.messages);
    } else {
      await scope.file(await backend.unfinishedMessages(followed.durableId)).catch(() => undefined);
    }

    if (end.type === "response" && scope.record.goal) save({ phase: "goal" });
    else save({ goal: undefined });

    return end;
  }

  async function handOverSteers(run: Live, backend: AgentBackend, durableId: string) {
    for (const { steerId, message } of run.steers.splice(0)) {
      await backend.steer(durableId, message, steerId).catch((error: unknown) => {
        console.warn(`Could not hand a message to run ${durableId}:`, errorMessage(error));
      });
    }
  }

  async function runGoal(scope: RunScope, goal: GoalRequest): Promise<DurableEnd> {
    const { runId, run, backend, save, build, forward } = scope;
    scope.stopIfCancelled();
    const exec = scope.current()?.find((tool) => tool.name === "exec_command");
    const working = await backend.startGoal({
      runId,
      request: goal,
      input: build(`goal-${runId}`, false),
      verify: verifyWith(exec, goal.verifyCommands ?? []),
      onEvent: forward,
      onSession: async (session, messages) =>
        scope.file([goalSessionMessage(session), ...withoutPrompt(messages)]),
      state: scope.record.goalState ?? { sessions: {} },
      saveState: (goalState) => save({ goalState: structuredClone(goalState) }),
      cursorOf: (durableId) => outbox.cursor(runId, durableId),
    });
    run.followed = working;
    run.goal = working;

    if (run.cancelReason) void working.cancel();

    const goalEnd = await working.done;

    if (goalEnd.type === "error") {
      save({ goal: undefined });
      return goalEnd;
    }

    save({ phase: "report" });
    return reportOnGoal(scope, goal, goalEnd);
  }

  async function reportOnGoal(
    scope: RunScope,
    goal: GoalRequest,
    goalEnd?: Exclude<GoalEnd, { type: "error" }>,
  ): Promise<DurableEnd> {
    const { runId, thread, run, backend, save, build, forward } = scope;
    scope.stopIfCancelled();
    const reportAgent = build(`run-${runId}-report`, false);
    let closing: FollowedRun;
    const { reportId } = scope.record;

    if (reportId) {
      closing = await backend.rejoin(
        reportId,
        reportAgent,
        outbox.cursor(runId, reportId),
        forward,
      );
    } else {
      if (!goalEnd) throw new Error("The goal's outcome is gone, so it cannot be reported");

      closing = await backend.start(
        `${runId}-report`,
        thread.id,
        goalReport(goal.objective, goalEnd),
        reportAgent,
        forward,
      );
    }

    save({ reportId: closing.durableId });
    run.followed = closing;
    const closed = await closing.done;

    if (closed.type !== "error") await scope.file(withoutPrompt(closed.messages));

    return closed;
  }

  function finish(runId: string, end: DurableEnd, cancelReason?: string) {
    if (context.stopped()) return;

    report(runId, (seq) =>
      end.type === "error"
        ? { type: "run.end", runId, seq, outcome: "error", error: cancelReason ?? end.error }
        : {
            type: "run.end",
            runId,
            seq,
            outcome: end.type,
            continuation: end.type === "interaction" ? end.continuation : undefined,
          },
    );
    const record = records.get(runId);

    if (record) records.save({ ...record, done: true });
  }

  return {
    live,

    start(message: RunMessage) {
      const record: RunRecord = {
        runId: message.runId,
        thread: message.thread,
        model: message.model,
        kind: message.type === "run.start" ? "start" : "answer",
        prompt: message.type === "run.start" ? message.prompt : undefined,
        compact: message.type === "run.start" ? message.compact : undefined,
        mentions: message.type === "run.start" ? message.mentions : undefined,
        skills: message.skills,
        memory: message.memory,
        webSearch: message.webSearch,
        cockpit: message.cockpit,
        agentId: `run-${message.runId}`,
        turn: 0,
        phase: "chat",
        backend: namedBackend(message.backend) ?? "native",
      };
      outbox.open(message.runId);
      records.save(record);
      return execute(record, message);
    },

    restore(runId: string, secrets?: RunSecrets) {
      const record = records.get(runId);

      if (!record) {
        outbox.open(runId);
        finish(runId, { type: "error", error: RUN_GONE });
        return;
      }

      if (record.done || live.has(runId)) return;

      return execute(record, undefined, secrets ?? {});
    },

    async steer({ runId, steerId, prompt, mentions }: SteerParams): Promise<SteerResult> {
      const run = live.get(runId);
      const record = records.get(runId);

      if (!run || !record || record.done) return { status: "closed" };

      if (record.compact) {
        return { status: "refused", reason: "The conversation is being compacted" };
      }

      if (record.phase === "report") {
        return {
          status: "refused",
          reason: "The agent is writing up how the goal ended: wait for it to finish",
        };
      }

      const message = sentPrompt(prompt, {
        mentions,
        skills: record.skillListing,
        paths: context.sandbox.paths?.(record.thread.id),
      });

      if (record.phase === "goal") {
        const taken = (await run.goal?.steer(message, steerId)) ?? false;
        return { status: taken ? "queued" : "closed" };
      }

      if (!record.durableId) {
        run.steers.push({ steerId, message });
        return { status: "queued" };
      }

      const taken = await (
        await context.backend(record.backend)
      ).steer(record.durableId, message, steerId);
      return { status: taken ? "queued" : "closed" };
    },

    async cancel(runId: string, reason: string) {
      const run = live.get(runId);

      if (run) {
        run.cancelReason = reason;
        void run.followed?.cancel();
        return;
      }

      const record = records.get(runId);

      if (!record || record.done) return;

      if (record.durableId)
        await (await context.backend(record.backend)).cancelRun(record.durableId);

      outbox.attach(runId, Number.MAX_SAFE_INTEGER);
      finish(runId, { type: "error", error: reason }, reason);
    },

    forget(runId: string) {
      records.delete(runId);
    },
  };
}

function codexRunInput({
  secrets,
  compact,
  attended,
  tools,
  webSearch,
  images,
  extras = {},
}: {
  secrets: RunSecrets;
  compact: boolean;
  attended: boolean;
  tools: readonly AnyTool[];
  webSearch?: RunWebSearch;
  images?: readonly string[];
  extras?: CodexInstructionExtras;
}): RunInput {
  const questions = attended && !compact;
  const listed = [...tools];

  if (questions) listed.push(createQuestionTool(), createSecretRequestTool());

  if (webSearch && !compact) listed.push(createWebSearchTool({ apiKey: webSearch.apiKey }));

  return {
    codex: {
      login: secrets.codexLogin ?? "",
      model: secrets.codexModel,
      instructions: codexInstructions({ questions, maxTurns: CODING_MAX_TURNS, ...extras }),
      tools: listed,
      redact: secretRedactor(secrets.env),
      compact,
      questions,
      children: !compact,
      rememberSession: attended || compact,
      images,
      extras,
    },
  };
}
