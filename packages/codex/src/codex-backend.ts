import type { AgentPrompt, Message } from "@anvia/core";
import type { AgentInteractionResponse } from "@anvia/core/agent/interactions";
import { NOTHING_TO_COMPACT } from "@aven/agents/compaction-agent";
import { providerOf, subagentInstructions } from "@aven/agents/subagent-instruction";
import { subagentTools } from "@aven/agents/subagents";
import type { SubagentTask } from "@aven/agents/tools/spawn-agent";
import { errorMessage } from "@aven/agents/values";
import { AGENT_BACKEND_CAPABILITIES, CODEX_TOKEN_MISSING } from "@aven/protocol/runtime-wire";
import type { QuestionPrompt } from "@aven/protocol/types";
import { dirname, join } from "node:path";

import { CodexTurn } from "./codex-events";
import { runCodexGoal } from "./codex-goals";
import { codexMcpTools } from "./codex-mcp";
import { serveCodexMcp } from "./codex-mcp-server";
import { codexSdkQuery, readCodexAuth } from "./codex-sdk";
import { parseCodexAuth } from "@aven/protocol/codex-auth";
import { CodexSessions } from "./codex-sessions";
import type {
  AgentBackend,
  AskedQuestion,
  AskedRun,
  CodexImage,
  CodexQuery,
  CodexRunContext,
  CodexSteer,
  CodexToolHost,
  DurableEnd,
  Emit,
  FollowedGoal,
  FollowedRun,
  GoalSpec,
  RunInput,
} from "@aven/agent-backend/types";

const STEER_NOTE =
  "The person sent this while you were working. Read it now and change course if it asks you to:";

const COMPACT_TURN =
  "Compact this conversation. Summarize the objective, the decisions, the files changed and what is left. Reply with one short note that you compacted the thread.";

const CONTINUE =
  "The runner restarted while you were working. Continue from the workspace. Do not repeat a step you already finished.";

type Gate = {
  promise: Promise<DurableEnd>;
  resolve(end: DurableEnd): void;
};

type PromptItem = { text: string; images: CodexImage[] };

type LiveRun = {
  durableId: string;
  threadId: string;
  agentId: string;
  runId: string;
  abort: AbortController;
  turn: CodexTurn;
  pending: PromptItem[];
  steers: CodexSteer[];
  gate: Gate;
  onEvent: Emit;
  close?(): void;
  accepting: boolean;
  promptPending: boolean;
  prompt: string;
  images: CodexImage[];
  cwd: string;
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

export class CodexRuns implements AgentBackend {
  readonly kind = "codex" as const;
  readonly capabilities = AGENT_BACKEND_CAPABILITIES.codex;
  #partial = new Map<string, Message[]>();
  #byDurable = new Map<string, LiveRun>();
  #byThread = new Map<string, LiveRun>();
  #parked = new Map<string, Parked>();

  private constructor(
    private readonly sessions: CodexSessions,
    private readonly query: CodexQuery,
    private readonly home: string,
  ) {}

  static open(journalPath: string, query: CodexQuery = codexSdkQuery) {
    return new CodexRuns(new CodexSessions(`${journalPath}.codex`), query, dirname(journalPath));
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
      context: input.codex,
      onEvent,
      durableId: `codex-${runId}`,
    });
  }

  rejoin(durableId: string, input: RunInput, _after: number, onEvent: Emit): Promise<FollowedRun> {
    const known = this.sessions.byDurable(durableId);
    return this.#open({
      runId: durableId,
      threadId: known?.threadId ?? durableId,
      prompt: CONTINUE,
      context: input.codex,
      onEvent,
      durableId,
      sessionId: known?.sessionId,
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
    const context = restore().codex;
    return this.#open({
      runId: `${asked.runId}-answer`,
      threadId: stored.threadId,
      prompt: text,
      context,
      onEvent,
      durableId: `codex-${asked.runId}-answer`,
      sessionId: stored.sessionId || undefined,
    });
  }

  steer(durableId: string, prompt: AgentPrompt, requestId: string) {
    const live = this.#byDurable.get(durableId);

    if (!live || live.abort.signal.aborted || !live.accepting) return Promise.resolve(false);

    const { text, images } = promptParts(prompt);
    live.steers.push({ id: requestId, text, images });
    return Promise.resolve(true);
  }

  startGoal(spec: GoalSpec): Promise<FollowedGoal> {
    const context = spec.input.codex;

    if (!context?.token) return Promise.reject(new Error(CODEX_TOKEN_MISSING));

    const abort = new AbortController();
    const waiting: { id: string; text: string }[] = [];
    let current: LiveRun | undefined;
    const done = runCodexGoal(
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

          for (const steer of taken) spec.onEvent({ type: "steer_applied", id: steer.id });

          return taken.map((steer) => steer.text);
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
        const text = promptText(prompt);

        if (current?.accepting) {
          current.steers.push({ id: requestId, text, images: [] });
          return true;
        }

        waiting.push({ id: requestId, text });
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
    images?: CodexImage[];
    context: CodexRunContext | undefined;
    onEvent: Emit;
    durableId?: string;
    sessionId?: string;
    rememberSession?: boolean;
    signal?: AbortSignal;
    onLive?: (live: LiveRun) => void;
  }): Promise<FollowedRun> {
    const context = options.context;

    if (!context?.token) throw new Error(CODEX_TOKEN_MISSING);

    const durableId = options.durableId ?? `codex-${options.runId}`;

    if (context.compact) {
      const sessionId = options.sessionId ?? this.sessions.get(options.threadId);

      if (!sessionId) return this.#note(options.onEvent, NOTHING_TO_COMPACT);

      options.sessionId = sessionId;
      options.prompt = COMPACT_TURN;
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
      turn: new CodexTurn(context.model, context.redact),
      pending: [],
      steers: [],
      gate: gate(),
      onEvent: options.onEvent,
      accepting: true,
      promptPending: true,
      prompt: options.prompt.trim() || "Continue.",
      images: options.images ?? [],
      cwd,
    };
    this.#byDurable.set(durableId, live);
    this.#byThread.set(options.threadId, live);
    options.onLive?.(live);
    live.pending.push({ text: live.prompt, images: live.images });
    void this.#consume(live, context, options);
    return {
      durableId,
      done: live.gate.promise,
      cancel: async () => this.#cancel(live),
    };
  }

  #host(live: LiveRun, context: CodexRunContext): CodexToolHost {
    const host: CodexToolHost = {
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

  #takePrompt(live: LiveRun) {
    const queued = live.pending.shift();

    if (queued) return queued;

    const taken = live.steers.splice(0);

    if (taken.length === 0) return undefined;

    for (const steer of taken) live.onEvent({ type: "steer_applied", id: steer.id });

    return {
      text: taken.map((steer) => steer.text).join("\n\n"),
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
    parent: CodexRunContext,
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
          instructions: subagentInstructions(task.type, providerOf(parent.instructions)),
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
    context: CodexRunContext,
    options: {
      sessionId?: string;
      rememberSession?: boolean;
    },
  ) {
    const prompt = live.prompt;
    const remember = options.rememberSession !== false;
    let token = context.token ?? "";
    const codexHome = join(this.home, "codex", live.threadId);
    const renew = () => {
      const refreshed = readCodexAuth(codexHome);
      const was = parseCodexAuth(token);
      const now = refreshed ? parseCodexAuth(refreshed) : undefined;

      if (!refreshed || !was || !now) return;

      if (
        was.tokens.access_token === now.tokens.access_token &&
        was.tokens.refresh_token === now.tokens.refresh_token
      ) {
        return;
      }

      const previous = token;
      token = refreshed;
      context.renewed?.(refreshed, previous);
    };
    let sessionId = options.sessionId ?? this.sessions.get(live.threadId);
    let mcp: ReturnType<typeof serveCodexMcp> | undefined;
    try {
      mcp = serveCodexMcp(await codexMcpTools(this.#host(live, context)));
      while (!live.abort.signal.aborted && !live.turn.error) {
        const next = this.#takePrompt(live);

        if (!next) {
          live.accepting = false;

          if (live.steers.length > 0) {
            live.accepting = true;
            continue;
          }

          break;
        }

        const stream = this.query({
          prompt: next.text,
          images: next.images,
          sessionId,
          token,
          cwd: live.cwd,
          codexHome,
          mcpUrl: mcp.url,
          mcpToken: mcp.token,
          abortController: live.abort,
          tools: this.#host(live, context),
          env: context.env,
          redact: context.redact,
          instructions: context.instructions,
          model: context.model,
          effort: context.effort,
        });
        live.close = stream.close?.bind(stream);
        for await (const event of stream) {
          if (live.turn.sessionId) sessionId = live.turn.sessionId;

          if (sessionId && remember) {
            this.sessions.set(live.threadId, sessionId, live.durableId);
          }

          for (const mapped of live.turn.take(event)) live.onEvent(mapped);

          if (sessionId && remember) {
            const parked = this.#parked.get(live.agentId);

            if (parked) {
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

          this.#partial.set(live.durableId, live.turn.messages(""));

          if (live.abort.signal.aborted) break;
        }
        live.close = undefined;
        renew();
      }
      this.#settle(live, prompt);
    } catch (error) {
      const messages = live.turn.release(live.promptPending ? prompt : "");
      live.promptPending = false;
      this.#partial.set(live.durableId, messages);
      let reason = errorMessage(error);

      if (reason.includes("Unable to locate Codex CLI")) {
        reason =
          "The Codex CLI could not be found. Set CODEX_PATH to the codex executable, or run from an install that includes @openai/codex.";
      }

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
      live.accepting = false;
      mcp?.close();
      renew();
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

  #cancel(live: LiveRun) {
    const parked = this.#parked.get(live.agentId);

    if (parked) {
      this.#parked.delete(live.agentId);
      parked.reject(new Error("The run was cancelled"));
    }

    live.accepting = false;
    live.abort.abort();
    live.close?.();
  }

  #note(onEvent: Emit, text: string): FollowedRun {
    onEvent({ type: "text", delta: text });
    const messages = [{ role: "assistant", content: [{ type: "text", text }] }] as Message[];
    return {
      durableId: `codex-note-${crypto.randomUUID()}`,
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
    state: { backend: "codex" },
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
    .flatMap((part) => (part.type === "text" && part.text.length > 0 ? [part.text] : []))
    .join("\n");
}

function promptText(prompt: AgentPrompt) {
  return promptParts(prompt).text;
}

function promptParts(prompt: AgentPrompt): { text: string; images: CodexImage[] } {
  if (typeof prompt === "string") return { text: prompt, images: [] };

  const content = prompt.content;

  if (typeof content === "string") return { text: content, images: [] };

  const images: CodexImage[] = [];
  for (const part of content) {
    if (part.type === "image" && part.image.type === "data" && part.mediaType) {
      images.push({ mediaType: part.mediaType, data: String(part.image.data) });
    }
  }
  return {
    text: content
      .flatMap((part) => (part.type === "text" && part.text.length > 0 ? [part.text] : []))
      .join("\n"),
    images,
  };
}
