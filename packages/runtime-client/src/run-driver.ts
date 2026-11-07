import type { AgentPrompt, AnyTool, Message } from "@anvia/core";
import {
  parseAgentContinuation,
  parseAgentInteractionResponse,
} from "@anvia/core/agent/interactions";
import { sentPrompt } from "@aven/agents/attachments";
import type { GoalRequest } from "@aven/agents/tools/define-goal";
import { errorMessage } from "@aven/agents/values";

import { keepAttachments, promptOf } from "./attachments";
import { DurableRuns } from "./durable-runs";
import { verifyWith } from "./goal-assessment";
import { goalReport, goalSessionMessage } from "./goal-report";
import { redactingTools, secretRedactor } from "./secret-redaction";
import { awaitingReady } from "./late-bound-tools";
import { createForkHost } from "./fork-host";
import { toolsForRun } from "./run-tools";
import { connectMcpServers } from "./mcp-servers";
import { markTurn } from "./thread-diff";
import { timing } from "./timing";
import type { RunMcpServer, RunThreadInfo, SteerResult } from "@aven/protocol/types";
import type {
  ConnectedMcp,
  DriverContext,
  DurableEnd,
  Emit,
  FollowedRun,
  GoalEnd,
  RunInput,
  RunMessage,
  RunRecord,
  SteerParams,
  ThreadWorkspaces,
  Timing,
} from "./types";

type Live = {
  threadId: string;
  save(changes: Partial<RunRecord>): void;
  followed?: Pick<FollowedRun, "cancel">;
  cancelReason?: string;
  steers: { steerId: string; message: AgentPrompt }[];
  mcp?: ConnectedMcp;
  mcpGoing?: Promise<ConnectedMcp | undefined>;
};

type RunScope = {
  readonly runId: string;
  readonly thread: RunThreadInfo;
  readonly run: Live;
  readonly clock: Timing;
  readonly journaled: DurableRuns;
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

async function prepareRun(
  sandbox: ThreadWorkspaces,
  runId: string,
  threadId: string,
  message: RunMessage | undefined,
  controlPlane: string,
) {
  const { github, identity, env } = message ?? {};
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

  async function connectMcp(run: Live, runId: string, threadId: string, message?: RunMessage) {
    const configs = message?.mcp ?? [];
    if (!configs.length) return undefined;
    await closeReleasedMcp(threadId);
    const key = mcpKey(configs);
    const kept = mcpConnections.get(threadId);
    let connected = kept && kept.results.every((result) => !result.error) ? kept : undefined;
    if (connected && mcpKeys.get(threadId) === key) {
      run.mcp = connected;
    } else {
      const replaced = connected;
      connected = undefined;
      if (replaced) {
        mcpConnections.delete(threadId);
        await replaced.close().catch(() => undefined);
      }
      connected = await connectMcpServers(configs);
      mcpConnections.set(threadId, connected);
      mcpKeys.set(threadId, key);
      run.mcp = connected;
    }
    context.call("mcp.report", { runId, results: connected.results }).catch((error: unknown) => {
      console.warn(`Run ${runId} could not report on its MCP servers:`, errorMessage(error));
    });
    return connected;
  }

  async function execute(initial: RunRecord, message?: RunMessage) {
    const { runId, thread } = initial;
    const clock = timing(`run ${runId}`);
    const state = { record: initial };
    const save = (changes: Partial<RunRecord>) => {
      state.record = { ...state.record, ...changes };
      if (!context.stopped()) records.save(state.record);
    };
    const run: Live = { threadId: thread.id, save, steers: [] };
    live.set(runId, run);
    let ended: DurableEnd["type"] | undefined;
    try {
      if (message?.type === "run.start" && message.attachments?.length) {
        save({
          attachments: await keepAttachments(context.sandbox, thread.id, message.attachments),
        });
      }
      clock.mark("attachments");
      const scope = await acquire(initial, state, run, message, clock);
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
    clock: Timing,
  ): Promise<RunScope> {
    const { runId, thread, model } = initial;
    return {
      runId,
      thread,
      run,
      clock,
      journaled: await context.journal,
      current: () => undefined,
      get record() {
        return state.record;
      },
      save: run.save,
      build: (id) => ({
        ...context.createAgent({ thread, id, attended: false, tools: [], model, compact: true }),
        contextWindow: model?.contextWindow,
      }),
      ...reporting(initial, state, run),
    };
  }

  async function acquire(
    initial: RunRecord,
    state: { record: RunRecord },
    run: Live,
    message: RunMessage | undefined,
    clock: Timing,
  ): Promise<RunScope> {
    const { env } = message ?? {};
    const { runId, thread, model } = initial;
    if (initial.compact) return compactionScope(initial, state, run, clock);
    const repoAccess = () => context.call("repo.access", { runId });
    await context.starting(thread.id);
    run.mcpGoing = connectMcp(run, runId, thread.id, message);
    run.mcpGoing.catch(() => undefined);
    const box = await context.sandbox.acquire(thread, repoAccess, { lazy: true });
    context.boxes.set(thread.id, box);
    const ready = (async () => {
      await box.start?.();
      clock.mark("sandbox");
      if (run.cancelReason) throw new Error(run.cancelReason);
      await prepareRun(context.sandbox, runId, thread.id, message, context.controlPlane);
      clock.mark("sign-in");
      if (state.record.kind === "start" && !state.record.durableId) {
        const root = await context.sandbox.workspace(thread.id);
        if (root) await markTurn(root).catch(() => false);
      }
      clock.mark("turn");
    })();
    ready.catch((error: unknown) => {
      run.cancelReason ??= errorMessage(error);
      void run.followed?.cancel();
    });
    const mcp = await run.mcpGoing;
    clock.mark("mcp");
    if (run.cancelReason) throw new Error(run.cancelReason);
    if (!state.record.skillListing) run.save({ skillListing: await installSkills(state.record) });
    clock.mark("skills");
    const journaled = await context.journal;
    const redact = secretRedactor(env);
    const current = () => {
      const live = context.boxes.get(thread.id)?.tools;
      const tools = live && awaitingReady(live, ready);
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
      journaled,
      current,
      get record() {
        return state.record;
      },
      save: run.save,
      build(id, attended) {
        const skills = state.record.skillListing;
        const envNames = env?.map(({ name }) => name);
        const forking = attended && !thread.forkOf;
        const { agent, compaction } = context.createAgent({
          thread,
          id,
          attended,
          forks: forking,
          tools: toolsForRun({
            sandbox: context.sandbox,
            thread,
            tools: awaitingReady(box.tools, ready),
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
            createSubagent: ({ type, id: subagentId, tools }) =>
              context.createAgent({
                thread,
                id: `${id}-${subagentId}`,
                attended: false,
                tools,
                skills,
                envNames,
                mcp: mcp?.note,
                model,
                role: type,
              }).agent,
          }),
          skills,
          envNames,
          mcp: mcp?.note,
          memory: state.record.memory,
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
    const { runId, thread, run, journaled, save, build, forward } = scope;
    let followed: FollowedRun;
    if (scope.record.durableId) {
      followed = await journaled.rejoin(
        scope.record.durableId,
        build(scope.record.agentId, true),
        outbox.cursor(runId, scope.record.durableId),
        forward,
      );
    } else if (scope.record.kind === "start") {
      followed = await journaled.start(
        runId,
        thread.id,
        await promptOf(scope.record, context.sandbox),
        build(scope.record.agentId, true),
        forward,
      );
    } else {
      const asked = await journaled.asked(thread.id);
      if (!asked) throw new Error("This thread has no question waiting for an answer");
      save({ agentId: asked.agentId });
      const resume = message?.type === "run.resume" ? message : undefined;
      const { interaction } = parseAgentContinuation(resume?.continuation);
      followed = await journaled.answer(
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
    await handOverSteers(run, journaled, followed.durableId);
    if (run.cancelReason) void followed.cancel();
    const end = await followed.done;
    if (end.type !== "error") {
      save({ turn: journaled.transcriptTurn(followed.durableId, end) });
      await scope.file(end.messages);
    } else {
      await scope
        .file(await journaled.unfinishedMessages(followed.durableId))
        .catch(() => undefined);
    }
    if (end.type === "response" && scope.record.goal) save({ phase: "goal" });
    else save({ goal: undefined });
    return end;
  }

  async function handOverSteers(run: Live, journaled: DurableRuns, durableId: string) {
    for (const { steerId, message } of run.steers.splice(0)) {
      await journaled.steer(durableId, message, steerId).catch((error: unknown) => {
        console.warn(`Could not hand a message to run ${durableId}:`, errorMessage(error));
      });
    }
  }

  async function runGoal(scope: RunScope, goal: GoalRequest): Promise<DurableEnd> {
    const { runId, run, journaled, save, build, forward } = scope;
    scope.stopIfCancelled();
    const exec = scope.current()?.find((tool) => tool.name === "exec_command");
    const working = await journaled.startGoal({
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
    const { runId, thread, run, journaled, save, build, forward } = scope;
    scope.stopIfCancelled();
    const reportAgent = build(`run-${runId}-report`, false);
    let closing: FollowedRun;
    const { reportId } = scope.record;
    if (reportId) {
      closing = await journaled.rejoin(
        reportId,
        reportAgent,
        outbox.cursor(runId, reportId),
        forward,
      );
    } else {
      if (!goalEnd) throw new Error("The goal's outcome is gone, so it cannot be reported");
      closing = await journaled.start(
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
        cockpit: message.cockpit,
        agentId: `run-${message.runId}`,
        turn: 0,
        phase: "chat",
      };
      outbox.open(message.runId);
      records.save(record);
      return execute(record, message);
    },

    restore(runId: string) {
      const record = records.get(runId);
      if (!record || record.done || live.has(runId)) return;
      return execute(record);
    },

    async steer({ runId, steerId, prompt, mentions }: SteerParams): Promise<SteerResult> {
      const run = live.get(runId);
      const record = records.get(runId);
      if (!run || !record || record.done) return { status: "closed" };
      if (record.compact) {
        return { status: "refused", reason: "The conversation is being compacted" };
      }
      if (record.phase !== "chat") {
        return {
          status: "refused",
          reason: "The agent is working on a goal in the background: stop it to talk to the agent",
        };
      }
      const message = sentPrompt(prompt, { mentions, skills: record.skillListing });
      if (!record.durableId) {
        run.steers.push({ steerId, message });
        return { status: "queued" };
      }
      const taken = await (await context.journal).steer(record.durableId, message, steerId);
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
      if (record.durableId) await (await context.journal).cancelRun(record.durableId);
      outbox.attach(runId, Number.MAX_SAFE_INTEGER);
      finish(runId, { type: "error", error: reason }, reason);
    },

    forget(runId: string) {
      records.delete(runId);
    },
  };
}
