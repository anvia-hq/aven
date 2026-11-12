import type { AgentPrompt, Message } from "@anvia/core";
import type { AgentInteractionResponse } from "@anvia/core/agent/interactions";
import { NOTHING_TO_COMPACT } from "@aven/agents/compaction-agent";
import { subagentInstructions } from "@aven/agents/subagent-instruction";
import { SUBAGENT_MAX_TURNS, subagentTools } from "@aven/agents/subagents";
import type { SubagentTask } from "@aven/agents/tools/spawn-agent";
import { CODING_MAX_TURNS } from "@aven/agents/turn-limits";
import { errorMessage } from "@aven/agents/values";
import { AGENT_BACKEND_CAPABILITIES, CLAUDE_TOKEN_MISSING } from "@aven/protocol/runtime-wire";
import type { QuestionPrompt } from "@aven/protocol/types";
import { dirname, join } from "node:path";

import { ClaudeTurn } from "./claude-events";
import { runClaudeGoal } from "./claude-goals";
import { claudeSdkQuery } from "./claude-sdk";
import { ClaudeSessions } from "./claude-sessions";
import type {
  AgentBackend,
  AskedQuestion,
  AskedRun,
  ClaudeQuery,
  ClaudeSteer,
  ClaudeRunContext,
  ClaudeToolHost,
  DurableEnd,
  Emit,
  FollowedGoal,
  FollowedRun,
  GoalSpec,
  RunInput,
} from "./types";

const STEER_NOTE =
  "The person sent this while you were working. Read it now and change course if it asks you to:";

type Gate = {
  promise: Promise<DurableEnd>;
  resolve(end: DurableEnd): void;
};

type LiveRun = {
  durableId: string;
  threadId: string;
  agentId: string;
  runId: string;
  abort: AbortController;
  turn: ClaudeTurn;
  queue: PromptQueue;
  steers: ClaudeSteer[];
  gate: Gate;
  onEvent: Emit;
  close?(): void;
  promptPending: boolean;
  prompt: string;
};

type Parked = {
  live: LiveRun;
  toolCallId: string;
  toolName: "ask_user" | "request_secret";
  questions: QuestionPrompt[];
  resolve(text: string): void;
  reject(error: Error): void;
};

function gate(): Gate {
  let resolve: (end: DurableEnd) => void = () => undefined;
  const promise = new Promise<DurableEnd>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

export class PromptQueue {
  #pending: string[] = [];
  #waiters: Array<(result: IteratorResult<string>) => void> = [];
  #closed = false;

  push(text: string) {
    if (this.#closed) return false;

    const waiter = this.#waiters.shift();

    if (waiter) waiter({ value: text, done: false });
    else this.#pending.push(text);

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

  stream(): AsyncIterable<string> {
    return {
      [Symbol.asyncIterator]: () => ({
        next: (): Promise<IteratorResult<string>> => {
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
    private readonly sessions: ClaudeSessions,
    private readonly query: ClaudeQuery,
    private readonly home: string,
  ) {}

  static open(journalPath: string, query: ClaudeQuery = claudeSdkQuery) {
    return new ClaudeRuns(new ClaudeSessions(`${journalPath}.claude`), query, dirname(journalPath));
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
    return this.#open({
      runId,
      threadId,
      prompt: promptText(prompt),
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
      prompt:
        "The runner restarted while you were working. Continue from the workspace. Do not repeat a step you already finished.",
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

    live.steers.push({ id: requestId, text: promptText(prompt) });
    return Promise.resolve(true);
  }

  startGoal(spec: GoalSpec): Promise<FollowedGoal> {
    const context = spec.input.claude;

    if (!context?.token) return Promise.reject(new Error(CLAUDE_TOKEN_MISSING));

    const abort = new AbortController();
    const waiting: string[] = [];
    let current: LiveRun | undefined;
    const done = runClaudeGoal(
      spec,
      async (prompt, signal) => {
        const followed = await this.#open({
          runId: `${spec.runId}-goal-${crypto.randomUUID()}`,
          threadId: `${spec.runId}-goal-${crypto.randomUUID()}`,
          prompt,
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
          return taken;
        },
      },
    ).catch((error: unknown) => ({ type: "error" as const, error: errorMessage(error) }));
    return Promise.resolve({
      done,
      cancel: async () => {
        abort.abort();

        if (current) this.#cancel(current);
      },
      steer: async (prompt) => {
        const text = promptText(prompt);

        if (current?.queue.push(text)) return true;

        waiting.push(text);
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
    context: ClaudeRunContext | undefined;
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

      if (!sessionId) return this.#note(options.onEvent, NOTHING_TO_COMPACT);

      options.sessionId = sessionId;
      options.prompt = "/compact";
    }

    const abort = new AbortController();

    if (options.signal) {
      if (options.signal.aborted) abort.abort();
      else options.signal.addEventListener("abort", () => abort.abort(), { once: true });
    }

    const cwd = await context.workspace();
    const live: LiveRun = {
      durableId,
      threadId: options.threadId,
      agentId: `run-${options.runId}`,
      runId: options.runId,
      abort,
      turn: new ClaudeTurn(context.redact),
      queue: new PromptQueue(),
      steers: [],
      gate: gate(),
      onEvent: options.onEvent,
      promptPending: true,
      prompt: options.prompt.trim() || "Continue.",
    };
    this.#byDurable.set(durableId, live);
    this.#byThread.set(options.threadId, live);
    options.onLive?.(live);
    const host = this.#host(live, context);
    live.queue.push(live.prompt);
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

  #host(live: LiveRun, context: ClaudeRunContext): ClaudeToolHost {
    const host: ClaudeToolHost = {
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

    return `${STEER_NOTE}\n\n${taken.map((steer) => steer.text).join("\n\n")}`;
  }

  #park(
    live: LiveRun,
    question: { name: "ask_user" | "request_secret"; questions: QuestionPrompt[] },
  ) {
    const existing = live.turn.openQuestion(question.name);
    const id = existing ?? crypto.randomUUID();
    const event = live.turn.ensureQuestion(id, question.name, question.questions);

    if (event) live.onEvent(event);

    const parked: Parked = {
      live,
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
      sessionId: live.turn.sessionId ?? "",
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
      continuation: continuationOf(live, id, question.name, question.questions),
      messages,
    });
    return waiting;
  }

  async #child(
    parent: ClaudeRunContext,
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
          instructions: subagentInstructions(task.type),
          tools: { catalog, questions: false, signal: meta.abortSignal, emit },
        },
        onEvent: (event) => {
          if (event.type === "tool_start") {
            emit?.({
              type: "subagent",
              index: meta.index,
              event: {
                type: "tool_start",
                tool: {
                  id: event.tool.id,
                  name: event.tool.name,
                  target: event.tool.target,
                  status: "running",
                },
              },
            });
          } else if (event.type === "tool_end") {
            emit?.({
              type: "subagent",
              index: meta.index,
              event: { type: "tool_end", id: event.id, status: event.status },
            });
          }
        },
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
    try {
      for await (const message of stream) {
        if (live.turn.sessionId && remember) {
          this.sessions.set(live.threadId, live.turn.sessionId, live.durableId);
        }

        for (const event of live.turn.take(message)) live.onEvent(event);

        if (live.turn.sessionId && remember) {
          this.sessions.set(live.threadId, live.turn.sessionId, live.durableId);
          const parked = this.#parked.get(live.agentId);

          if (parked) {
            this.sessions.park({
              threadId: live.threadId,
              agentId: live.agentId,
              runId: live.runId,
              sessionId: live.turn.sessionId,
              toolCallId: parked.toolCallId,
              toolName: parked.toolName,
              questions: parked.questions,
            });
          }
        }

        this.#partial.set(live.durableId, live.turn.messages(""));

        if (message.type === "result") {
          const next = live.steers.splice(0);

          if (next.length > 0) {
            for (const steer of next) live.onEvent({ type: "steer_applied", id: steer.id });

            live.queue.push(next.map((steer) => steer.text).join("\n\n"));
          } else if (live.queue.empty) {
            live.queue.close();
          }
        }

        if (live.abort.signal.aborted) break;
      }
      this.#settle(live, prompt);
    } catch (error) {
      const messages = live.turn.release(live.promptPending ? prompt : "");
      live.promptPending = false;
      this.#partial.set(live.durableId, messages);
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
      live.queue.close();
      this.#byDurable.delete(live.durableId);

      if (this.#byThread.get(live.threadId) === live) this.#byThread.delete(live.threadId);
    }
  }

  #settle(live: LiveRun, prompt: string) {
    const parked = this.#parked.get(live.agentId);

    if (parked) {
      this.#parked.delete(live.agentId);
      parked.reject(new Error("The question closed before it was answered"));
    }

    const messages = live.turn.release(live.promptPending ? prompt : "");
    live.promptPending = false;

    if (live.abort.signal.aborted) {
      this.#partial.set(live.durableId, messages);
      live.gate.resolve({ type: "error", error: "The run was cancelled" });
      return;
    }

    if (live.turn.error) {
      this.#partial.set(live.durableId, messages);
      live.gate.resolve({ type: "error", error: live.turn.error });
      return;
    }

    this.#partial.delete(live.durableId);
    live.gate.resolve({ type: "response", messages });
  }

  #release(live: LiveRun) {
    this.#byDurable.delete(live.durableId);

    if (this.#byThread.get(live.threadId) === live) this.#byThread.delete(live.threadId);

    live.queue.close();
  }

  #cancel(live: LiveRun) {
    const parked = this.#parked.get(live.agentId);

    if (parked) {
      this.#parked.delete(live.agentId);
      parked.reject(new Error("The run was cancelled"));
    }

    live.queue.close();
    live.abort.abort();
    live.close?.();
  }

  #note(onEvent: Emit, text: string): FollowedRun {
    onEvent({ type: "text", delta: text });
    const messages = [
      { role: "assistant", content: [{ type: "text", text }] },
    ] as unknown as Message[];
    return {
      durableId: `claude-note-${crypto.randomUUID()}`,
      done: Promise.resolve({ type: "response", messages }),
      cancel: async () => undefined,
    };
  }
}

function continuationOf(
  live: LiveRun,
  toolCallId: string,
  toolName: string,
  questions: QuestionPrompt[],
) {
  return {
    version: 1 as const,
    agentId: live.agentId,
    sourceRunId: live.runId,
    interaction: {
      type: "tool-question" as const,
      id: toolCallId,
      toolName,
      toolCallId,
      internalCallId: toolCallId,
      questions: questions.map((question) => {
        const prompt: {
          id: string;
          text: string;
          choices?: { label: string; value: string }[];
          allowCustom?: boolean;
        } = { id: question.id, text: question.text };

        if (question.choices?.length) {
          prompt.choices = question.choices.map((choice) => ({
            label: choice.label,
            value: choice.value,
          }));
        }

        if (question.allowCustom === true) prompt.allowCustom = true;

        return prompt;
      }),
    },
    state: { backend: "claude" },
  };
}

function answered(response: AgentInteractionResponse) {
  if (response.type !== "tool-question") return "The person did not answer.";

  const lines = response.answers.map((answer) => `${answer.questionId}: ${answer.value}`);
  return `The person answered:\n${lines.join("\n")}`;
}

function assistantText(messages: readonly Message[]) {
  const last = [...messages].reverse().find((message) => message.role === "assistant");

  if (!last) return "";

  if (typeof last.content === "string") return last.content;

  return last.content
    .map((part) => (part.type === "text" ? part.text : ""))
    .filter((text) => text.length > 0)
    .join("\n");
}

function promptText(prompt: AgentPrompt) {
  if (typeof prompt === "string") return prompt;

  const content = prompt.content;

  if (typeof content === "string") return content;

  return content
    .map((part) => (part.type === "text" ? part.text : ""))
    .filter((text) => text.length > 0)
    .join("\n");
}
