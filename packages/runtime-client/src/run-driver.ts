import type { Agent, AnyTool, Message } from "@anvia/core";
import {
  parseAgentContinuation,
  parseAgentInteractionResponse,
} from "@anvia/core/agent/interactions";
import type { DurableAgentRegistration } from "@anvia/durable";
import type { SkillListing } from "@aven/agents/skills";
import type { GoalRequest } from "@aven/agents/tools/define-goal";
import { errorMessage } from "@aven/agents/values";
import type { RunEvent } from "@aven/protocol/events";
import type {
  ControlPlaneToRuntime,
  RunModel,
  RunThreadInfo,
  RuntimeCalls,
  RuntimeToControlPlane,
} from "@aven/protocol/runtime-wire";

import { keepAttachments, promptOf } from "./attachments";
import type { GoalEnd } from "./durable-goals";
import { DurableRuns, type Emit, type FollowedRun, type RunInput } from "./durable-runs";
import type { DurableEnd } from "./durable-events";
import { verifyWith } from "./goal-assessment";
import { goalReport, goalSessionMessage } from "./goal-report";
import type { RunOutbox, Source } from "./run-outbox";
import { redactingTools, secretRedactor } from "./secret-redaction";
import type { RunRecord, RunRecords } from "./run-records";
import { toolsForRun } from "./run-tools";
import type { ThreadSandbox, ThreadWorkspaces } from "./sandbox";
import { markTurn } from "./thread-diff";

export type CreateRuntimeAgent = (input: {
  thread: RunThreadInfo;
  /** The agent's id: durable registers one agent per run. */
  id: string;
  /** Whether a person is there to answer: only then may the agent ask a question. */
  attended: boolean;
  /** What the agent can do in the thread's sandbox: files, commands, processes and a desktop. */
  tools: readonly AnyTool[];
  /** The skills in the sandbox, for the instructions (decision 0035). */
  skills?: readonly SkillListing[];
  /** The names of the project's environment variables the run came with (decision 0045). */
  envNames?: readonly string[];
  model?: RunModel;
}) => { agent: Agent<unknown>; compaction?: DurableAgentRegistration["compaction"] };

export type RunMessage = Extract<ControlPlaneToRuntime, { type: "run.start" | "run.resume" }>;

type Live = {
  threadId: string;
  /** Records something about the run as it goes. */
  save(changes: Partial<RunRecord>): void;
  /** Not there until the thread's sandbox is up and the run is in the journal; a goal's, while it works. */
  followed?: Pick<FollowedRun, "cancel">;
  /** Why the run was cancelled, also when the cancel arrived before there was a run to cancel. */
  cancelReason?: string;
};

// What every part of one wire run works with. `record` is read from here each time, never kept:
// `save` replaces it as the run goes.
type RunScope = {
  readonly runId: string;
  readonly thread: RunThreadInfo;
  readonly run: Live;
  readonly journaled: DurableRuns;
  readonly record: RunRecord;
  save(changes: Partial<RunRecord>): void;
  /** The tools of the thread's sandbox as it is now. */
  current(): readonly AnyTool[] | undefined;
  /** The agent for a part of the run; only an attended one may ask or take on a goal. */
  build(id: string, attended: boolean): RunInput;
  forward: Emit;
  /** Files messages of the run with the control plane, after those filed before. */
  file(messages: Message[]): Promise<void>;
  stopIfCancelled(): void;
};

// What an unattended part of the run is told is a note to the agent, not something the user said.
const withoutPrompt = (messages: Message[]) =>
  messages[0]?.role === "user" ? messages.slice(1) : messages;

// Gives the thread's sandbox what the starting run brought, of what the sandbox can take: who the
// sender is on GitHub, an identity to mint tokens with, and the project's variables. All of it is
// kept in memory and out of the record and the journal; a run taken up after a restart has none.
async function prepareRun(
  sandbox: ThreadWorkspaces,
  runId: string,
  threadId: string,
  message: RunMessage | undefined,
  controlPlane: string,
) {
  const { github, identity, env } = message ?? {};
  // The GitHub account the sender gave this run, or none (decision 0044). A failure to sign in
  // does not fail the run: it has no GitHub.
  await sandbox.signInGithub?.(threadId, github).catch((error: unknown) => {
    console.warn(`Run ${runId} could not sign in to GitHub:`, errorMessage(error));
  });
  // What `aven id-token` mints tokens with; a failure does not fail the run (decision 0049).
  await sandbox.signInIdentity?.(threadId, identity, controlPlane).catch((error: unknown) => {
    console.warn(`Run ${runId} could not sign in to mint identity tokens:`, errorMessage(error));
  });
  // The project's variables for this run's commands, until the next message (decision 0045).
  sandbox.setProjectEnv?.(threadId, env);
}

export type DriverContext = {
  journal: Promise<DurableRuns>;
  records: RunRecords;
  outbox: RunOutbox;
  sandbox: ThreadWorkspaces;
  createAgent: CreateRuntimeAgent;
  call<M extends keyof RuntimeCalls>(
    method: M,
    params: RuntimeCalls[M]["params"],
  ): Promise<RuntimeCalls[M]["result"]>;
  /** Sends a message of a run, or keeps it for when the control plane asks. */
  report(
    runId: string,
    make: (seq: number) => Extract<RuntimeToControlPlane, { type: "run.event" | "run.end" }>,
    source?: Source,
  ): void;
  /** The sandboxes of the threads that have one. */
  boxes: Map<string, ThreadSandbox>;
  /** A run is about to use the thread's sandbox: it must not be released as idle. */
  starting(threadId: string): Promise<void>;
  /** A run is over: the thread's sandbox may be released once it has been idle for a while. */
  finished(threadId: string): void;
  /** The control plane's origin, which the sandbox's `aven` command calls to mint identity tokens. */
  controlPlane: string;
  /** The runner is shutting down: its state is closed, so nothing more is recorded. */
  stopped(): boolean;
};

// Runs one wire run from its first message to its end: the agent's turn, a goal it hands over, and
// the report on it. What it needs to take the run up again after a restart is in a record, saved as
// it goes (decision 0024).
export function createRunDriver(context: DriverContext) {
  const { records, outbox, report } = context;
  const live = new Map<string, Live>();
  // A thread has one run at a time; the agent of an answered question is the one the asking run built,
  // so what it hands over reaches the run that is going now, not the one that built it.
  const activeRun = (threadId: string) =>
    [...live.values()].find((run) => run.threadId === threadId);

  async function execute(initial: RunRecord, message?: RunMessage) {
    const { runId, thread } = initial;
    const state = { record: initial };
    const save = (changes: Partial<RunRecord>) => {
      state.record = { ...state.record, ...changes };
      if (!context.stopped()) records.save(state.record);
    };
    const run: Live = { threadId: thread.id, save };
    live.set(runId, run);
    try {
      if (message?.type === "run.start" && message.attachments?.length) {
        save({
          attachments: await keepAttachments(context.sandbox, thread.id, message.attachments),
        });
      }
      const scope = await acquire(initial, state, run, message);
      const end = await phases(scope, message);
      finish(runId, end, run.cancelReason);
    } catch (error) {
      finish(runId, { type: "error", error: errorMessage(error) });
    } finally {
      live.delete(runId);
      context.finished(thread.id);
    }
  }

  // Puts the run's skills in the thread's /skills and lists them with the repository's (decision 0035).
  async function installSkills({ runId, thread, skills = [] }: RunRecord) {
    const store = context.sandbox.skills;
    if (!store) return [];
    const fetch = async (digest: string) =>
      Uint8Array.fromBase64((await context.call("skills.get", { runId, digest })).data);
    return store.install(thread.id, skills, fetch, await context.sandbox.workspace(thread.id));
  }

  // Gets the run what it works with: the thread's sandbox and the journal. Everything a phase of the
  // run does goes through the scope this returns.
  async function acquire(
    initial: RunRecord,
    state: { record: RunRecord },
    run: Live,
    message?: RunMessage,
  ): Promise<RunScope> {
    const { env } = message ?? {};
    const { runId, thread, model } = initial;
    // Read-only access to the thread's repository, asked for each time it is needed.
    const repoAccess = () => context.call("repo.access", { runId });
    await context.starting(thread.id);
    // Clones the repository and starts the thread's container on first use; a failure ends the run with a clear error.
    const box = await context.sandbox.acquire(thread, repoAccess);
    if (run.cancelReason) throw new Error(run.cancelReason);
    context.boxes.set(thread.id, box);
    await prepareRun(context.sandbox, runId, thread.id, message, context.controlPlane);
    // Once per run: a run taken up after a restart keeps the skills it was told of.
    if (!state.record.skillListing) run.save({ skillListing: await installSkills(state.record) });
    // What this turn changes is measured from here; a run picked up again after a restart, or
    // resumed with an answer, is still the same turn.
    if (state.record.kind === "start" && !state.record.durableId) {
      const root = await context.sandbox.workspace(thread.id);
      if (root) await markTurn(root).catch(() => false);
    }
    const journaled = await context.journal;
    // The thread's sandbox as it is now: a run that waited for an answer may find it replaced.
    // What its tools give back hides this run's secrets, the goal's checks included (decision 0045).
    const redact = secretRedactor(env);
    const current = () => {
      const tools = context.boxes.get(thread.id)?.tools;
      return tools && redact ? redactingTools(tools, redact) : tools;
    };

    return {
      runId,
      thread,
      run,
      journaled,
      current,
      get record() {
        return state.record;
      },
      save: run.save,
      build(id, attended) {
        const { agent, compaction } = context.createAgent({
          thread,
          id,
          attended,
          tools: toolsForRun({
            sandbox: context.sandbox,
            thread,
            tools: box.tools,
            current,
            attended,
            repoAccess,
            defineGoal: (goal) => activeRun(thread.id)?.save({ goal }),
          }),
          skills: state.record.skillListing,
          envNames: env?.map(({ name }) => name),
          model,
        });
        return { agent, compaction, contextWindow: model?.contextWindow };
      },
      // Events reach the control plane as the journal records them.
      forward: (event: RunEvent, source) =>
        report(runId, (seq) => ({ type: "run.event", runId, seq, event }), source),
      // The transcript the control plane keeps, filed as each part of the run ends.
      async file(messages) {
        if (messages.length === 0) return;
        await context.call("memory.append", { runId, turn: state.record.turn, messages });
        run.save({ turn: state.record.turn + messages.length });
      },
      stopIfCancelled() {
        if (run.cancelReason) throw new Error(run.cancelReason);
      },
    };
  }

  // The parts of the run that are left, from where its record says it is.
  async function phases(scope: RunScope, message?: RunMessage): Promise<DurableEnd> {
    let end: DurableEnd = { type: "response", messages: [] };
    if (scope.record.phase === "chat") end = await runChat(scope, message);
    const goal = scope.record.goal;
    if (goal && scope.record.phase === "goal") return runGoal(scope, goal);
    if (goal && scope.record.phase === "report") return reportOnGoal(scope, goal);
    return end;
  }

  // The agent's turn.
  async function runChat(scope: RunScope, message?: RunMessage): Promise<DurableEnd> {
    const { runId, thread, run, journaled, save, build, forward } = scope;
    let followed: FollowedRun;
    if (scope.record.durableId) {
      // Picked up again after a restart: the run is in the journal, and the control plane has
      // heard everything of it up to the newest event this run reported.
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
      // The question stays parked in the journal; the answer is delivered to it.
      const asked = await journaled.asked(thread.id);
      if (!asked) throw new Error("This thread has no question waiting for an answer");
      // The run in the journal is the one that asked, with the agent it was registered under.
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
    run.followed = followed;
    if (run.cancelReason) void followed.cancel();
    const end = await followed.done;
    if (end.type !== "error") {
      // A run that stopped on a question and was answered files its second part after the first.
      save({ turn: journaled.transcriptTurn(followed.durableId, end) });
      await scope.file(end.messages);
    }
    // Handed a goal: the rest of the run is the goal and the report on it.
    if (end.type === "response" && scope.record.goal) save({ phase: "goal" });
    else save({ goal: undefined });
    return end;
  }

  // The goal the turn handed over: sessions until the verify commands pass or it stops short.
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
    const goalEnd = await working.done;
    if (goalEnd.type === "error") {
      save({ goal: undefined });
      return goalEnd;
    }
    save({ phase: "report" });
    return reportOnGoal(scope, goal, goalEnd);
  }

  // One more turn, unattended, in which the agent tells the thread how the goal went.
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

  // The run is over: tell the control plane, and note that nothing is left but its acknowledgement.
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
            // What resumes a run that stopped to ask the user; the control plane keeps it.
            continuation: end.type === "interaction" ? end.continuation : undefined,
          },
    );
    const record = records.get(runId);
    if (record) records.save({ ...record, done: true });
  }

  return {
    /** Runs that are going in this process, for the sandbox's idle check and for cancels. */
    live,

    /** A run the control plane just started. */
    start(message: RunMessage) {
      const record: RunRecord = {
        runId: message.runId,
        thread: message.thread,
        model: message.model,
        kind: message.type === "run.start" ? "start" : "answer",
        prompt: message.type === "run.start" ? message.prompt : undefined,
        mentions: message.type === "run.start" ? message.mentions : undefined,
        skills: message.skills,
        agentId: `run-${message.runId}`,
        turn: 0,
        phase: "chat",
      };
      outbox.open(message.runId);
      records.save(record);
      return execute(record, message);
    },

    /** A run this process had before it restarted, which the control plane asked for again. */
    restore(runId: string) {
      const record = records.get(runId);
      // Nothing to take up: it is going, or it is over and only waiting to be acknowledged.
      if (!record || record.done || live.has(runId)) return;
      return execute(record);
    },

    async cancel(runId: string, reason: string) {
      const run = live.get(runId);
      if (run) {
        run.cancelReason = reason;
        void run.followed?.cancel();
        return;
      }
      // Not going in this process, yet the control plane wants it stopped: it is over.
      const record = records.get(runId);
      if (!record || record.done) return;
      if (record.durableId) await (await context.journal).cancelRun(record.durableId);
      // The control plane did not ask for this run, so it will not ask for its end either.
      outbox.attach(runId, Number.MAX_SAFE_INTEGER);
      finish(runId, { type: "error", error: reason }, reason);
    },

    forget(runId: string) {
      records.delete(runId);
    },
  };
}
