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
import { backendMcpTools } from "@aven/agent-backend/mcp";
import { BackendSessions } from "@aven/agent-backend/sessions";
import type {
  AgentBackend,
  AskedQuestion,
  AskedRun,
  BackendImage,
  BackendSteer,
  BackendToolHost,
  BackendUserInput,
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
import { subagentTools } from "@aven/agents/subagents";
import type { SubagentTask } from "@aven/agents/tools/spawn-agent";
import { errorMessage } from "@aven/agents/values";
import { parseCodexAuth } from "@aven/protocol/codex-auth";
import { AGENT_BACKEND_CAPABILITIES, CODEX_TOKEN_MISSING } from "@aven/protocol/runtime-wire";
import type { QuestionPrompt } from "@aven/protocol/types";
import { dirname, join } from "node:path";

import { CodexTurn } from "./events";
import { serveCodexMcp } from "./mcp-server";
import { codexSdkQuery, readCodexAuth, removeCodexAuth } from "./sdk";
import type { CodexQuery } from "./types";

const COMPACT_TURN =
  "Compact this conversation. Summarize the objective, the decisions, the files changed and what is left. Reply with one short note that you compacted the thread.";

type LiveRun = {
  durableId: string;
  threadId: string;
  agentId: string;
  runId: string;
  abort: AbortController;
  unlinkAbort: () => void;
  turn: CodexTurn;
  pending: BackendUserInput[];
  steers: BackendSteer[];
  gate: Gate;
  onEvent: Emit;
  close?(): void;
  accepting: boolean;
  promptPending: boolean;
  prompt: string;
  images: BackendImage[];
  cwd: string;
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

export class CodexRuns implements AgentBackend {
  readonly kind = "codex" as const;
  readonly capabilities = AGENT_BACKEND_CAPABILITIES.codex;
  #partial = new Map<string, Message[]>();
  #byDurable = new Map<string, LiveRun>();
  #byThread = new Map<string, LiveRun>();
  #parked = new Map<string, Parked>();

  private constructor(
    private readonly sessions: BackendSessions,
    private readonly query: CodexQuery,
    private readonly home: string,
  ) {}

  static open(journalPath: string, query: CodexQuery = codexSdkQuery) {
    return new CodexRuns(
      new BackendSessions(`${journalPath}.codex`, "codex"),
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

        if (current?.accepting) {
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
    rememberSession?: boolean;
    signal?: AbortSignal;
    onLive?: (live: LiveRun) => void;
  }): Promise<FollowedRun> {
    const context = options.context;

    if (!context?.token) throw new Error(CODEX_TOKEN_MISSING);

    const durableId = options.durableId ?? `codex-${options.runId}`;

    if (context.compact) {
      const sessionId = options.sessionId ?? this.sessions.get(options.threadId);

      if (!sessionId) return noteRun("codex", options.onEvent, NOTHING_TO_COMPACT);

      options.sessionId = sessionId;
      options.prompt = COMPACT_TURN;
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
      continuation: continuationOf("codex", live, id, question.name, question.questions),
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
    context: HostedRunContext,
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
    let savedSessionId: string | undefined;
    let mcp: ReturnType<typeof serveCodexMcp> | undefined;
    try {
      const host = this.#host(live, context);
      mcp = serveCodexMcp(await backendMcpTools(host));
      while (!live.abort.signal.aborted && !live.turn.error) {
        const next = this.#takePrompt(live);

        if (!next) {
          live.accepting = false;
          break;
        }

        live.turn.beginTurn();
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
          tools: host,
          env: context.env,
          redact: context.redact,
          instructions: context.instructions,
          model: context.model,
          effort: context.effort,
        });
        live.close = stream.close?.bind(stream);
        for await (const event of stream) {
          for (const mapped of live.turn.take(event)) live.onEvent(mapped);

          if (live.turn.sessionId) sessionId = live.turn.sessionId;

          if (sessionId && remember && sessionId !== savedSessionId) {
            this.sessions.set(live.threadId, sessionId, live.durableId);
            savedSessionId = sessionId;
          }

          if (sessionId && remember) {
            const parked = this.#parked.get(live.agentId);

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

          if (remember) this.#partial.set(live.durableId, live.turn.messages(""));

          if (live.abort.signal.aborted) break;
        }
        live.close = undefined;
        renew();
      }
      this.#settle(live, prompt, remember);
    } catch (error) {
      const messages = live.turn.release(live.promptPending ? prompt : "");
      live.promptPending = false;

      if (remember) this.#partial.set(live.durableId, messages);

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
      live.unlinkAbort();
      live.accepting = false;
      mcp?.close();
      renew();
      removeCodexAuth(codexHome);
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

  #cancel(live: LiveRun) {
    const parked = this.#parked.get(live.agentId);

    if (parked) {
      this.#parked.delete(live.agentId);
      this.sessions.clearPark(live.threadId);
      parked.reject(new Error("The run was cancelled"));
    }

    live.accepting = false;
    live.abort.abort();
    live.close?.();
  }
}
