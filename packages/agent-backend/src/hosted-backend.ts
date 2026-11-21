import type { AgentPrompt, Message } from "@anvia/core";
import type { AgentInteractionResponse } from "@anvia/core/agent/interactions";
import { NOTHING_TO_COMPACT } from "@aven/agents/compaction-agent";
import { subagentInstructions } from "@aven/agents/subagent-instruction";
import { SUBAGENT_MAX_TURNS, subagentTools } from "@aven/agents/subagents";
import type { SubagentTask } from "@aven/agents/tools/spawn-agent";
import { errorMessage } from "@aven/agents/values";
import type { AgentBackendCapabilities, QuestionPrompt } from "@aven/protocol/types";

import { runBackendGoal } from "./goals";
import {
  CONTINUE,
  STEER_NOTE,
  answered,
  assistantText,
  continuationOf,
  gate,
  linkAbortSignal,
  noteRun,
  promptParts,
  subagentEventForwarder,
} from "./hosted-helpers";
import type { BackendSessions } from "./sessions";
import type {
  AgentBackend,
  AskedQuestion,
  AskedRun,
  BackendSessionPrefix,
  BackendSteer,
  BackendToolHost,
  Emit,
  FollowedGoal,
  FollowedRun,
  GoalSpec,
  HostedLiveRun,
  HostedOpenOptions,
  HostedRunContext,
  HostedTurnLike,
  RunInput,
} from "./types";

type Parked<TLive> = {
  live: TLive;
  sessionId: string;
  toolCallId: string;
  toolName: "ask_user" | "request_secret";
  questions: QuestionPrompt[];
  resolve(text: string): void;
  reject(error: Error): void;
};

export abstract class HostedAgentBackend<
  TTurn extends HostedTurnLike,
  TLive extends HostedLiveRun<TTurn>,
> implements AgentBackend {
  abstract readonly kind: BackendSessionPrefix;
  abstract readonly capabilities: AgentBackendCapabilities;
  protected abstract readonly tokenMissingMessage: string;
  protected abstract readonly compactPrompt: string;
  protected readonly partial = new Map<string, Message[]>();
  protected readonly byDurable = new Map<string, TLive>();
  protected readonly byThread = new Map<string, TLive>();
  protected readonly parked = new Map<string, Parked<TLive>>();

  protected constructor(
    protected readonly sessions: BackendSessions,
    protected readonly home: string,
  ) {}

  protected abstract contextOf(input: RunInput): HostedRunContext | undefined;

  protected abstract createLive(
    base: Omit<HostedLiveRun<TTurn>, "turn">,
    context: HostedRunContext,
  ): TLive;

  protected abstract isAcceptingSteer(live: TLive): boolean;

  protected abstract launch(
    live: TLive,
    context: HostedRunContext,
    options: HostedOpenOptions<TLive>,
  ): void;

  protected onCancel(_live: TLive): void {}

  protected onBeforeCancel(_live: TLive): void {}

  protected formatError(reason: string): string {
    return reason;
  }

  asked(threadId: string) {
    const live = this.byThread.get(threadId);
    const parked = live ? this.parked.get(live.agentId) : undefined;

    if (parked) return Promise.resolve({ runId: parked.live.runId, agentId: parked.live.agentId });

    const stored = this.sessions.parked(threadId);
    return Promise.resolve(stored && { runId: stored.runId, agentId: stored.agentId });
  }

  start(
    runId: string,
    threadId: string,
    prompt: AgentPrompt,
    input: RunInput,
    onEvent: Emit,
  ): Promise<FollowedRun> {
    const { text, images } = promptParts(prompt);
    return this.openRun({
      runId,
      threadId,
      prompt: text,
      images,
      context: this.contextOf(input),
      onEvent,
      durableId: `${this.kind}-${runId}`,
    });
  }

  rejoin(durableId: string, input: RunInput, _after: number, onEvent: Emit): Promise<FollowedRun> {
    const known = this.sessions.byDurable(durableId);
    return this.openRun({
      runId: durableId,
      threadId: known?.threadId ?? durableId,
      prompt: CONTINUE,
      context: this.contextOf(input),
      onEvent,
      durableId,
      sessionId: known?.sessionId,
      resumeInterrupted: true,
    });
  }

  async answer(
    asked: AskedRun,
    _question: AskedQuestion,
    response: AgentInteractionResponse,
    restore: () => RunInput,
    onEvent: Emit,
  ): Promise<FollowedRun> {
    const text = answered(response);
    const parked = this.parked.get(asked.agentId);

    if (parked) {
      this.parked.delete(asked.agentId);
      this.sessions.clearPark(parked.live.threadId);
      parked.live.onEvent = onEvent;
      parked.resolve(text);
      return {
        durableId: parked.live.durableId,
        done: parked.live.gate.promise,
        cancel: async () => this.cancel(parked.live),
      };
    }

    const stored = this.sessions.parkedAgent(asked.agentId);

    if (!stored) throw new Error("This thread has no question waiting for an answer");

    this.sessions.clearPark(stored.threadId);
    return this.openRun({
      runId: `${asked.runId}-answer`,
      threadId: stored.threadId,
      prompt: text,
      context: this.contextOf(restore()),
      onEvent,
      durableId: `${this.kind}-${asked.runId}-answer`,
      sessionId: stored.sessionId || undefined,
    });
  }

  steer(durableId: string, prompt: AgentPrompt, requestId: string) {
    const live = this.byDurable.get(durableId);

    if (!live || live.abort.signal.aborted || !this.isAcceptingSteer(live)) {
      return Promise.resolve(false);
    }

    const { text, images } = promptParts(prompt);
    live.steers.push({ id: requestId, text, images });
    return Promise.resolve(true);
  }

  startGoal(spec: GoalSpec): Promise<FollowedGoal> {
    const context = this.contextOf(spec.input);

    if (!context?.token) return Promise.reject(new Error(this.tokenMissingMessage));

    const abort = new AbortController();
    const waiting: BackendSteer[] = [];
    let current: TLive | undefined;
    const done = runBackendGoal(
      spec,
      async (prompt, signal, images) => {
        const followed = await this.openRun({
          runId: `${spec.runId}-goal-${crypto.randomUUID()}`,
          threadId: `${spec.runId}-goal-${crypto.randomUUID()}`,
          prompt,
          images,
          context: { ...context, questions: false, compact: false },
          onEvent: spec.onEvent,
          rememberSession: false,
          signal,
          onLive: (live) => {
            current = live;
          },
        });
        const end = await followed.done;
        current = undefined;

        if (end.type === "error") throw new Error(end.error);

        return { summary: assistantText(end.messages), messages: end.messages };
      },
      abort.signal,
      {
        drain: () => {
          const taken = waiting.splice(0);

          for (const steer of taken) spec.onEvent({ type: "steer_applied", id: steer.id });

          return taken.map(({ text, images }) => ({ text, images }));
        },
      },
    ).catch((error: unknown) => ({
      type: "error" as const,
      error: context.redact(errorMessage(error)),
    }));
    return Promise.resolve({
      done,
      cancel: async () => {
        abort.abort();

        if (current) this.cancel(current);
      },
      steer: async (prompt, requestId) => {
        const { text, images } = promptParts(prompt);

        if (current && !current.abort.signal.aborted && this.isAcceptingSteer(current)) {
          current.steers.push({ id: requestId, text, images });
          return true;
        }

        waiting.push({ id: requestId, text, images });
        return true;
      },
    });
  }

  transcriptTurn() {
    return 0;
  }

  unfinishedMessages(durableId: string) {
    const messages = this.partial.get(durableId) ?? [];
    this.partial.delete(durableId);
    return Promise.resolve(messages);
  }

  async cancelRun(durableId: string) {
    const live = this.byDurable.get(durableId);

    if (live) this.cancel(live);
  }

  async close() {
    for (const live of this.byDurable.values()) this.cancel(live);
    for (const parked of this.parked.values()) parked.reject(new Error("The runner is closing"));
    this.parked.clear();
    this.byDurable.clear();
    this.byThread.clear();
    this.partial.clear();
    this.sessions.close();
  }

  protected async openRun(options: HostedOpenOptions<TLive>): Promise<FollowedRun> {
    const context = options.context;

    if (!context?.token) throw new Error(this.tokenMissingMessage);

    const durableId = options.durableId ?? `${this.kind}-${options.runId}`;

    if (context.compact) {
      const sessionId = options.sessionId ?? this.sessions.get(options.threadId);

      if (!sessionId) return noteRun(this.kind, options.onEvent, NOTHING_TO_COMPACT);

      options.sessionId = sessionId;
      options.prompt = this.compactPrompt;
    }

    const abort = new AbortController();
    const unlinkAbort = linkAbortSignal(options.signal, abort);
    let cwd: string;
    try {
      cwd = await context.workspace();
    } catch (error) {
      unlinkAbort();
      throw error;
    }

    const live = this.createLive(
      {
        durableId,
        threadId: options.threadId,
        agentId: `run-${options.runId}`,
        runId: options.runId,
        abort,
        unlinkAbort,
        steers: [],
        gate: gate(),
        onEvent: options.onEvent,
        promptPending: true,
        prompt: options.prompt.trim() || "Continue.",
        images: options.images ?? [],
        cwd,
      },
      context,
    );
    this.byDurable.set(durableId, live);
    this.byThread.set(options.threadId, live);
    options.onLive?.(live);

    try {
      this.launch(live, context, options);
    } catch (error) {
      this.release(live);
      throw error;
    }

    return {
      durableId,
      done: live.gate.promise,
      cancel: async () => this.cancel(live),
    };
  }

  protected createToolHost(live: TLive, context: HostedRunContext): BackendToolHost {
    const host: BackendToolHost = {
      ...context.tools,
      steered: () => this.readSteers(live),
      questions: context.questions !== false && context.tools.questions !== false,
      signal: live.abort.signal,
      shown: (artifacts) => live.turn.queueArtifacts(artifacts),
    };

    if (host.questions !== false) host.onPark = (question) => this.park(live, question);

    if (context.children !== false) {
      host.runSubagent = (task, meta) => this.runChild(context, task, meta);
    }

    return host;
  }

  protected readSteers(live: TLive) {
    const taken = live.steers.splice(0);

    if (taken.length === 0) return undefined;

    for (const steer of taken) live.onEvent({ type: "steer_applied", id: steer.id });

    return {
      text: `${STEER_NOTE}\n\n${taken.map((steer) => steer.text).join("\n\n")}`,
      images: taken.flatMap((steer) => steer.images),
    };
  }

  protected syncSession(
    live: TLive,
    sessionId: string | undefined,
    savedSessionId: string | undefined,
    remember: boolean,
  ): string | undefined {
    let nextSaved = savedSessionId;

    if (sessionId && remember && sessionId !== nextSaved) {
      this.sessions.set(live.threadId, sessionId, live.durableId);
      nextSaved = sessionId;
    }

    if (sessionId && remember) {
      const parked = this.parked.get(live.agentId);

      if (parked && parked.sessionId !== sessionId) {
        parked.sessionId = sessionId;
        this.sessions.park({
          threadId: live.threadId,
          agentId: live.agentId,
          runId: live.runId,
          sessionId,
          toolCallId: parked.toolCallId,
          toolName: parked.toolName,
          questions: parked.questions,
        });
      }
    }

    if (remember) this.partial.set(live.durableId, live.turn.messages(""));

    return nextSaved;
  }

  protected settle(live: TLive, prompt: string, remember: boolean) {
    const parked = this.parked.get(live.agentId);

    if (parked) {
      this.parked.delete(live.agentId);

      if (live.abort.signal.aborted || live.turn.error) {
        this.sessions.clearPark(live.threadId);
      }

      parked.reject(new Error("The question closed before it was answered"));
    }

    const messages = live.turn.release(live.promptPending ? prompt : "");
    live.promptPending = false;

    if (live.abort.signal.aborted) {
      if (remember) this.partial.set(live.durableId, messages);

      live.gate.resolve({ type: "error", error: "The run was cancelled" });
      return;
    }

    if (live.turn.error) {
      if (remember) this.partial.set(live.durableId, messages);

      live.gate.resolve({ type: "error", error: live.turn.error });
      return;
    }

    this.partial.delete(live.durableId);
    live.gate.resolve({ type: "response", messages });
  }

  protected failRun(live: TLive, prompt: string, remember: boolean, error: unknown) {
    const messages = live.turn.release(live.promptPending ? prompt : "");
    live.promptPending = false;

    if (remember) this.partial.set(live.durableId, messages);

    let reason = live.turn.redactError(this.formatError(errorMessage(error)));

    if (live.abort.signal.aborted) reason = "The run was cancelled";
    else if (live.turn.error) reason = live.turn.error;

    const parked = this.parked.get(live.agentId);

    if (parked) {
      this.parked.delete(live.agentId);
      this.sessions.clearPark(live.threadId);
      parked.reject(new Error(reason));
    }

    live.gate.resolve({ type: "error", error: reason });
  }

  protected cleanupLive(live: TLive) {
    live.unlinkAbort();
    this.byDurable.delete(live.durableId);

    if (this.byThread.get(live.threadId) === live) this.byThread.delete(live.threadId);
  }

  protected release(live: TLive) {
    this.cleanupLive(live);
    this.onCancel(live);
  }

  protected cancel(live: TLive) {
    const parked = this.parked.get(live.agentId);

    if (parked) {
      this.parked.delete(live.agentId);
      this.sessions.clearPark(live.threadId);
      parked.reject(new Error("The run was cancelled"));
    }

    this.onBeforeCancel(live);
    live.abort.abort();
    live.close?.();
    this.onCancel(live);
  }

  private park(
    live: TLive,
    question: { name: "ask_user" | "request_secret"; questions: QuestionPrompt[] },
  ) {
    const existing = live.turn.openQuestion(question.name);
    const id = existing ?? crypto.randomUUID();
    const event = live.turn.ensureQuestion(id, question.name, question.questions);

    if (event) live.onEvent(event);

    const sessionId = live.turn.sessionId ?? "";
    const parked: Parked<TLive> = {
      live,
      sessionId,
      toolCallId: id,
      toolName: question.name,
      questions: question.questions,
      resolve: () => undefined,
      reject: () => undefined,
    };
    const waiting = new Promise<string>((resolve, reject) => {
      parked.resolve = resolve;
      parked.reject = reject;
    });
    this.parked.set(live.agentId, parked);
    this.sessions.park({
      threadId: live.threadId,
      agentId: live.agentId,
      runId: live.runId,
      sessionId,
      toolCallId: id,
      toolName: question.name,
      questions: question.questions,
    });
    const messages = live.turn.release(live.promptPending ? live.prompt : "");
    live.promptPending = false;
    const finished = live.gate;
    live.gate = gate();
    finished.resolve({
      type: "interaction",
      continuation: continuationOf(this.kind, live, id, question.name, question.questions),
      messages,
    });
    return waiting;
  }

  private async runChild(
    parent: HostedRunContext,
    task: SubagentTask,
    meta: { index: number; abortSignal?: AbortSignal },
  ) {
    const emit = parent.tools.emit;
    const catalog = subagentTools(task.type, parent.tools.catalog ?? []);
    try {
      const followed = await this.openRun({
        runId: `subagent-${task.type}-${meta.index}-${crypto.randomUUID()}`,
        threadId: `subagent-${crypto.randomUUID()}`,
        prompt: task.prompt,
        context: {
          ...parent,
          questions: false,
          children: false,
          instructions: subagentInstructions(task.type, parent.machine),
          machine: parent.machine,
          tools: { catalog, questions: false, signal: meta.abortSignal, emit },
        },
        onEvent: subagentEventForwarder(emit, meta.index),
        rememberSession: false,
        signal: meta.abortSignal,
        maxTurns: SUBAGENT_MAX_TURNS,
      });
      const end = await followed.done;

      if (end.type === "error") throw new Error(end.error);

      const output = assistantText(end.messages);
      emit?.({
        type: "subagent",
        index: meta.index,
        event: { type: "end", status: "done", output },
      });
      return output;
    } catch (error) {
      const output = parent.redact(errorMessage(error));
      emit?.({
        type: "subagent",
        index: meta.index,
        event: { type: "end", status: "error", output },
      });
      throw error;
    }
  }
}
