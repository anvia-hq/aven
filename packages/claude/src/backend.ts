import type { AgentPrompt, Message } from "@anvia/core";
import type { AgentInteractionResponse } from "@anvia/core/agent/interactions";
import { runBackendGoal } from "@aven/agent-backend/goals";
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
} from "@aven/agent-backend/hosted-helpers";
import { BackendSessions } from "@aven/agent-backend/sessions";
import type {
  AgentBackend,
  AskedQuestion,
  AskedRun,
  BackendImage,
  BackendPromptItem,
  BackendSteer,
  BackendToolHost,
  Emit,
  FollowedGoal,
  FollowedRun,
  Gate,
  GoalSpec,
  HostedRunContext,
  RunInput,
} from "@aven/agent-backend/types";
import { NOTHING_TO_COMPACT } from "@aven/agents/compaction-agent";
import { subagentInstructions } from "@aven/agents/subagent-instruction";
import { SUBAGENT_MAX_TURNS, subagentTools } from "@aven/agents/subagents";
import type { SubagentTask } from "@aven/agents/tools/spawn-agent";
import { CODING_MAX_TURNS } from "@aven/agents/turn-limits";
import { errorMessage } from "@aven/agents/values";
import { AGENT_BACKEND_CAPABILITIES, CLAUDE_TOKEN_MISSING } from "@aven/protocol/runtime-wire";
import type { QuestionPrompt } from "@aven/protocol/types";
import { dirname, join } from "node:path";

import { ClaudeTurn } from "./events";
import { claudeSdkQuery } from "./sdk";
import type { ClaudeQuery } from "./types";

type LiveRun = {
  durableId: string;
  threadId: string;
  agentId: string;
  runId: string;
  abort: AbortController;
  unlinkAbort: () => void;
  turn: ClaudeTurn;
  queue: PromptQueue;
  steers: BackendSteer[];
  gate: Gate;
  onEvent: Emit;
  close?(): void;
  promptPending: boolean;
  prompt: string;
  images: BackendImage[];
};

type Parked = {
  live: LiveRun;
  sessionId: string;
  toolCallId: string;
  toolName: "ask_user" | "request_secret";
  questions: QuestionPrompt[];
  resolve(text: string): void;
  reject(error: Error): void;
};

export class PromptQueue {
  #pending: BackendPromptItem[] = [];
  #waiters: Array<(result: IteratorResult<BackendPromptItem>) => void> = [];
  #closed = false;

  push(item: BackendPromptItem) {
    if (this.#closed) return false;

    const waiter = this.#waiters.shift();

    if (waiter) waiter({ value: item, done: false });
    else this.#pending.push(item);

    return true;
  }

  get closed() {
    return this.#closed;
  }

  get empty() {
    return this.#pending.length === 0;
  }

  close() {
    if (this.#closed) return;

    this.#closed = true;
    for (const waiter of this.#waiters.splice(0)) waiter({ value: undefined, done: true });
  }

  stream(): AsyncIterable<BackendPromptItem> {
    return {
      [Symbol.asyncIterator]: () => ({
        next: (): Promise<IteratorResult<BackendPromptItem>> => {
          const next = this.#pending.shift();

          if (next !== undefined) return Promise.resolve({ value: next, done: false });

          if (this.#closed) return Promise.resolve({ value: undefined, done: true });

          return new Promise((resolve) => this.#waiters.push(resolve));
        },
      }),
    };
  }
}

export class ClaudeRuns implements AgentBackend {
  readonly kind = "claude" as const;
  readonly capabilities = AGENT_BACKEND_CAPABILITIES.claude;
  #partial = new Map<string, Message[]>();
  #byDurable = new Map<string, LiveRun>();
  #byThread = new Map<string, LiveRun>();
  #parked = new Map<string, Parked>();

  private constructor(
    private readonly sessions: BackendSessions,
    private readonly query: ClaudeQuery,
    private readonly home: string,
  ) {}

  static open(journalPath: string, query: ClaudeQuery = claudeSdkQuery) {
    return new ClaudeRuns(
      new BackendSessions(`${journalPath}.claude`, "claude"),
      query,
      dirname(journalPath),
    );
  }

  asked(threadId: string) {
    const live = this.#byThread.get(threadId);
    const parked = live ? this.#parked.get(live.agentId) : undefined;

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
    return this.#open({
      runId,
      threadId,
      prompt: text,
      images,
      context: input.claude,
      onEvent,
      durableId: `claude-${runId}`,
    });
  }

  rejoin(durableId: string, input: RunInput, _after: number, onEvent: Emit): Promise<FollowedRun> {
    const known = this.sessions.byDurable(durableId);
    return this.#open({
      runId: durableId,
      threadId: known?.threadId ?? durableId,
      prompt: CONTINUE,
      context: input.claude,
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
    const parked = this.#parked.get(asked.agentId);

    if (parked) {
      this.#parked.delete(asked.agentId);
      this.sessions.clearPark(parked.live.threadId);
      parked.live.onEvent = onEvent;
      parked.resolve(text);
      return {
        durableId: parked.live.durableId,
        done: parked.live.gate.promise,
        cancel: async () => this.#cancel(parked.live),
      };
    }

    const stored = this.sessions.parkedAgent(asked.agentId);

    if (!stored) throw new Error("This thread has no question waiting for an answer");

    this.sessions.clearPark(stored.threadId);
    const context = restore().claude;
    return this.#open({
      runId: `${asked.runId}-answer`,
      threadId: stored.threadId,
      prompt: text,
      context,
      onEvent,
      durableId: `claude-${asked.runId}-answer`,
      sessionId: stored.sessionId || undefined,
    });
  }

  steer(durableId: string, prompt: AgentPrompt, requestId: string) {
    const live = this.#byDurable.get(durableId);

    if (!live || live.abort.signal.aborted || live.queue.closed) return Promise.resolve(false);

    const { text, images } = promptParts(prompt);
    live.steers.push({ id: requestId, text, images });
    return Promise.resolve(true);
  }

  startGoal(spec: GoalSpec): Promise<FollowedGoal> {
    const context = spec.input.claude;

    if (!context?.token) return Promise.reject(new Error(CLAUDE_TOKEN_MISSING));

    const abort = new AbortController();
    const waiting: BackendSteer[] = [];
    let current: LiveRun | undefined;
    const done = runBackendGoal(
      spec,
      async (prompt, signal, images) => {
        const followed = await this.#open({
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
    ).catch((error: unknown) => ({ type: "error" as const, error: errorMessage(error) }));
    return Promise.resolve({
      done,
      cancel: async () => {
        abort.abort();

        if (current) this.#cancel(current);
      },
      steer: async (prompt, requestId) => {
        const { text, images } = promptParts(prompt);
        const item: BackendPromptItem = images.length > 0 ? { text, images } : text;

        if (current?.queue.push(item)) {
          spec.onEvent({ type: "steer_applied", id: requestId });
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
    const messages = this.#partial.get(durableId) ?? [];
    this.#partial.delete(durableId);
    return Promise.resolve(messages);
  }

  async cancelRun(durableId: string) {
    const live = this.#byDurable.get(durableId);

    if (live) this.#cancel(live);
  }

  async close() {
    for (const live of this.#byDurable.values()) this.#cancel(live);
    for (const parked of this.#parked.values()) parked.reject(new Error("The runner is closing"));
    this.#parked.clear();
    this.#byDurable.clear();
    this.#byThread.clear();
    this.#partial.clear();
    this.sessions.close();
  }

  async #open(options: {
    runId: string;
    threadId: string;
    prompt: string;
    images?: BackendImage[];
    context: HostedRunContext | undefined;
    onEvent: Emit;
    durableId?: string;
    sessionId?: string;
    resumeInterrupted?: boolean;
    rememberSession?: boolean;
    signal?: AbortSignal;
    onLive?: (live: LiveRun) => void;
    maxTurns?: number;
  }): Promise<FollowedRun> {
    const context = options.context;

    if (!context?.token) throw new Error(CLAUDE_TOKEN_MISSING);

    const durableId = options.durableId ?? `claude-${options.runId}`;

    if (context.compact) {
      const sessionId = options.sessionId ?? this.sessions.get(options.threadId);

      if (!sessionId) return noteRun("claude", options.onEvent, NOTHING_TO_COMPACT);

      options.sessionId = sessionId;
      options.prompt = "/compact";
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

    const live: LiveRun = {
      durableId,
      threadId: options.threadId,
      agentId: `run-${options.runId}`,
      runId: options.runId,
      abort,
      unlinkAbort,
      turn: new ClaudeTurn(context.redact, context.model),
      queue: new PromptQueue(),
      steers: [],
      gate: gate(),
      onEvent: options.onEvent,
      promptPending: true,
      prompt: options.prompt.trim() || "Continue.",
      images: options.images ?? [],
    };
    this.#byDurable.set(durableId, live);
    this.#byThread.set(options.threadId, live);
    options.onLive?.(live);
    const host = this.#host(live, context);
    live.queue.push(
      live.images.length > 0 ? { text: live.prompt, images: live.images } : live.prompt,
    );
    let stream: ReturnType<ClaudeQuery>;

    try {
      stream = this.query({
        prompt: live.queue.stream(),
        sessionId: options.sessionId ?? this.sessions.get(options.threadId),
        token: context.token,
        cwd,
        configDir: join(this.home, "claude", options.threadId),
        binaryDir: join(this.home, "claude-code"),
        abortController: abort,
        tools: host,
        env: context.env,
        redact: context.redact,
        instructions: context.instructions,
        model: context.model,
        effort: context.effort,
        maxTurns: options.maxTurns ?? CODING_MAX_TURNS,
        resumeInterrupted: options.resumeInterrupted,
      });
    } catch (error) {
      this.#release(live);
      throw error;
    }

    live.close = stream.close?.bind(stream);
    void this.#consume(live, stream, options.rememberSession !== false);
    return {
      durableId,
      done: live.gate.promise,
      cancel: async () => this.#cancel(live),
    };
  }

  #host(live: LiveRun, context: HostedRunContext): BackendToolHost {
    const host: BackendToolHost = {
      ...context.tools,
      steered: () => this.#readSteers(live),
      questions: context.questions !== false && context.tools.questions !== false,
      signal: live.abort.signal,
      shown: (artifacts) => live.turn.queueArtifacts(artifacts),
    };

    if (host.questions !== false) host.onPark = (question) => this.#park(live, question);

    if (context.children !== false) {
      host.runSubagent = (task, meta) => this.#child(context, task, meta);
    }

    return host;
  }

  #readSteers(live: LiveRun) {
    const taken = live.steers.splice(0);

    if (taken.length === 0) return undefined;

    for (const steer of taken) live.onEvent({ type: "steer_applied", id: steer.id });

    return {
      text: `${STEER_NOTE}\n\n${taken.map((steer) => steer.text).join("\n\n")}`,
      images: taken.flatMap((steer) => steer.images),
    };
  }

  #park(
    live: LiveRun,
    question: { name: "ask_user" | "request_secret"; questions: QuestionPrompt[] },
  ) {
    const existing = live.turn.openQuestion(question.name);
    const id = existing ?? crypto.randomUUID();
    const event = live.turn.ensureQuestion(id, question.name, question.questions);

    if (event) live.onEvent(event);

    const sessionId = live.turn.sessionId ?? "";
    const parked: Parked = {
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
    this.#parked.set(live.agentId, parked);
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
      continuation: continuationOf("claude", live, id, question.name, question.questions),
      messages,
    });
    return waiting;
  }

  async #child(
    parent: HostedRunContext,
    task: SubagentTask,
    meta: { index: number; abortSignal?: AbortSignal },
  ) {
    const emit = parent.tools.emit;
    const catalog = subagentTools(task.type, parent.tools.catalog ?? []);
    try {
      const followed = await this.#open({
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
      const output = errorMessage(error);
      emit?.({
        type: "subagent",
        index: meta.index,
        event: { type: "end", status: "error", output },
      });
      throw error;
    }
  }

  async #consume(
    live: LiveRun,
    stream: AsyncIterable<Parameters<ClaudeTurn["take"]>[0]>,
    remember: boolean,
  ) {
    const prompt = live.prompt;
    let savedSessionId: string | undefined;
    try {
      for await (const message of stream) {
        for (const event of live.turn.take(message)) live.onEvent(event);

        const currentSessionId = live.turn.sessionId;

        if (currentSessionId && remember && currentSessionId !== savedSessionId) {
          this.sessions.set(live.threadId, currentSessionId, live.durableId);
          savedSessionId = currentSessionId;
        }

        if (currentSessionId && remember) {
          const parked = this.#parked.get(live.agentId);

          if (parked && parked.sessionId !== currentSessionId) {
            parked.sessionId = currentSessionId;
            this.sessions.park({
              threadId: live.threadId,
              agentId: live.agentId,
              runId: live.runId,
              sessionId: currentSessionId,
              toolCallId: parked.toolCallId,
              toolName: parked.toolName,
              questions: parked.questions,
            });
          }
        }

        if (remember) this.#partial.set(live.durableId, live.turn.messages(""));

        if (message.type === "result") {
          const next = live.steers.splice(0);

          if (next.length > 0) {
            for (const steer of next) live.onEvent({ type: "steer_applied", id: steer.id });

            const text = next.map((steer) => steer.text).join("\n\n");
            const images = next.flatMap((steer) => steer.images);
            live.queue.push(images.length > 0 ? { text, images } : text);
          } else if (live.queue.empty) {
            live.queue.close();
          }
        }

        if (live.abort.signal.aborted) break;
      }
      this.#settle(live, prompt, remember);
    } catch (error) {
      const messages = live.turn.release(live.promptPending ? prompt : "");
      live.promptPending = false;

      if (remember) this.#partial.set(live.durableId, messages);

      let reason = errorMessage(error);

      if (live.abort.signal.aborted) reason = "The run was cancelled";
      else if (live.turn.error) reason = live.turn.error;

      const parked = this.#parked.get(live.agentId);

      if (parked) {
        this.#parked.delete(live.agentId);
        this.sessions.clearPark(live.threadId);
        parked.reject(new Error(reason));
      }

      live.gate.resolve({ type: "error", error: reason });
    } finally {
      live.unlinkAbort();
      live.queue.close();
      this.#byDurable.delete(live.durableId);

      if (this.#byThread.get(live.threadId) === live) this.#byThread.delete(live.threadId);
    }
  }

  #settle(live: LiveRun, prompt: string, remember: boolean) {
    const parked = this.#parked.get(live.agentId);

    if (parked) {
      this.#parked.delete(live.agentId);

      if (live.abort.signal.aborted || live.turn.error) {
        this.sessions.clearPark(live.threadId);
      }

      parked.reject(new Error("The question closed before it was answered"));
    }

    const messages = live.turn.release(live.promptPending ? prompt : "");
    live.promptPending = false;

    if (live.abort.signal.aborted) {
      if (remember) this.#partial.set(live.durableId, messages);

      live.gate.resolve({ type: "error", error: "The run was cancelled" });
      return;
    }

    if (live.turn.error) {
      if (remember) this.#partial.set(live.durableId, messages);

      live.gate.resolve({ type: "error", error: live.turn.error });
      return;
    }

    this.#partial.delete(live.durableId);
    live.gate.resolve({ type: "response", messages });
  }

  #release(live: LiveRun) {
    live.unlinkAbort();
    this.#byDurable.delete(live.durableId);

    if (this.#byThread.get(live.threadId) === live) this.#byThread.delete(live.threadId);

    live.queue.close();
  }

  #cancel(live: LiveRun) {
    const parked = this.#parked.get(live.agentId);

    if (parked) {
      this.#parked.delete(live.agentId);
      this.sessions.clearPark(live.threadId);
      parked.reject(new Error("The run was cancelled"));
    }

    live.queue.close();
    live.abort.abort();
    live.close?.();
  }
}
