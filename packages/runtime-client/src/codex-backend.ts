import { AGENT_BACKEND_CAPABILITIES } from "@aven/protocol/runtime-wire";
import type { AgentPrompt, JsonValue, Message } from "@anvia/core";
import { createSpawnAgentTool, type SubagentTask } from "@aven/agents/tools/spawn-agent";
import { subagentTools } from "@aven/agents/subagents";
import type { RunSubagent } from "@aven/agents/tools/types";
import { errorMessage } from "@aven/agents/values";
import { clip } from "@aven/agents/tool-projection";
import {
  CODEX_INTERRUPTED,
  CODEX_LOGIN_MISSING,
  CODEX_NOTHING_TO_COMPACT,
  CODEX_TURNS_USED,
  codexAccessToken,
  codexSecretValues,
} from "@aven/protocol/codex-login";
import { SPAWN_AGENT_TOOL_NAME } from "@aven/protocol/events";
import type { QuestionPrompt, RunEvent } from "@aven/protocol/types";
import { CODING_MAX_TURNS } from "@aven/agents/turn-limits";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import type { Server } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { CodexQuery } from "./codex-fake";
import { followCodexGoal } from "./codex-goals";
import { codexInstructions } from "./codex-instructions";
import { createCodexTranscript } from "./codex-events";
import {
  CodexToolHost,
  projectCall,
  projectEnd,
  serveCodexTools,
  type CodexToolSink,
} from "./codex-mcp";
import { codexConfig, codexMcpCommand, codexProcessEnv, codexThreadOptions } from "./codex-process";
import { CodexSessions } from "./codex-sessions";
import type {
  AgentBackend,
  AskedQuestion,
  AskedRun,
  CodexRunContext,
  DurableEnd,
  Emit,
  FollowedGoal,
  FollowedRun,
  GoalSpec,
  RunInput,
} from "./types";
import type { AgentInteractionResponse } from "@anvia/core/agent/interactions";

const CANCELLED = "The run was cancelled";

type Gate = {
  promise: Promise<DurableEnd>;
  resolve: (end: DurableEnd) => void;
};

type Live = {
  threadId: string;
  runId: string;
  durableId: string;
  agentId: string;
  context: CodexRunContext;
  abort: AbortController;
  onEvent: Emit;
  transcript: ReturnType<typeof createCodexTranscript>;
  host: CodexToolHost;
  queue: string[];
  gate: Gate;
  filed: number;
  settled: boolean;
  server?: Server;
  socketPath?: string;
  socketFolder?: string;
  park?: { pending: PromiseWithResolvers<string> };
};

export class CodexRuns implements AgentBackend {
  readonly kind = "codex";
  readonly capabilities = AGENT_BACKEND_CAPABILITIES.codex;
  #sessions: CodexSessions;
  #home: string;
  #query: CodexQuery;
  #lives = new Map<string, Live>();

  private constructor(sessions: CodexSessions, home: string, query: CodexQuery) {
    this.#sessions = sessions;
    this.#home = home;
    this.#query = query;
  }

  static open(journalPath: string, query: CodexQuery) {
    return new CodexRuns(
      new CodexSessions(`${journalPath}.codex`),
      `${journalPath}.codex-home`,
      query,
    );
  }

  async asked(threadId: string): Promise<AskedRun | undefined> {
    const live = [...this.#lives.values()].find((run) => run.threadId === threadId && run.park);

    if (live) return { runId: live.durableId, agentId: live.agentId };

    const parked = this.#sessions.parked(threadId);

    if (!parked) return undefined;

    return { runId: parked.durableId, agentId: parked.agentId };
  }

  async start(
    runId: string,
    threadId: string,
    prompt: AgentPrompt,
    input: RunInput,
    onEvent: Emit,
  ): Promise<FollowedRun> {
    const context = input.codex;

    if (!context) throw new Error(CODEX_LOGIN_MISSING);

    if (context.compact && !this.#sessions.session(threadId)) {
      onEvent({ type: "text", delta: CODEX_NOTHING_TO_COMPACT });
      return doneNow(runId, [
        { role: "assistant", content: [{ type: "text", text: CODEX_NOTHING_TO_COMPACT }] },
      ]);
    }

    const images = context.images ? Array.from(context.images) : [];
    return this.#open({
      runId,
      threadId,
      prompt: context.compact ? "/compact" : promptText(prompt),
      images,
      context,
      onEvent,
    });
  }

  async rejoin(durableId: string, input: RunInput, _after: number, onEvent: Emit) {
    const context = input.codex;

    if (!context) throw new Error(CODEX_LOGIN_MISSING);

    const saved = this.#sessions.byDurable(durableId);
    return this.#open({
      runId: durableId,
      threadId: saved?.thread_id ?? durableId,
      prompt: CODEX_INTERRUPTED,
      images: [],
      context,
      onEvent,
      sessionId: saved?.session_id,
    });
  }

  async answer(
    asked: AskedRun,
    _question: AskedQuestion,
    response: AgentInteractionResponse,
    restore: () => RunInput,
    onEvent: Emit,
  ): Promise<FollowedRun> {
    const live = [...this.#lives.values()].find((run) => run.durableId === asked.runId && run.park);

    if (live?.park) {
      live.onEvent = onEvent;
      const pending = live.park.pending;
      live.park = undefined;
      this.#sessions.clearPark(live.threadId);
      pending.resolve(answerText(response));
      return followed(live);
    }

    const context = restore().codex;

    if (!context) throw new Error(CODEX_LOGIN_MISSING);

    const threadId =
      this.#sessions.byDurable(asked.runId)?.thread_id ?? this.#sessions.parkedThread(asked.runId);
    const saved = threadId ? this.#sessions.session(threadId) : undefined;
    this.#sessions.clearPark(threadId ?? "");
    return this.#open({
      runId: asked.runId,
      threadId: threadId ?? asked.runId,
      prompt: `The user answered:\n${answerText(response)}`,
      images: [],
      context: { ...context, rememberSession: true, compact: false },
      onEvent,
      sessionId: saved?.session_id,
    });
  }

  async steer(durableId: string, prompt: AgentPrompt) {
    const live = this.#lives.get(durableId);

    if (!live || live.settled) return false;

    live.queue.push(promptText(prompt));
    return true;
  }

  startGoal(goal: GoalSpec): Promise<FollowedGoal> {
    const context = goal.input.codex;

    if (!context) return Promise.reject(new Error(CODEX_LOGIN_MISSING));

    return Promise.resolve(
      followCodexGoal(goal, async (prompt, signal, queue) => {
        const followedRun = await this.#open({
          runId: `${goal.runId}-goal-${crypto.randomUUID()}`,
          threadId: `goal-${goal.runId}`,
          prompt,
          images: [],
          context: { ...context, rememberSession: false, questions: false, compact: false },
          onEvent: goal.onEvent,
          signal,
          queue,
        });
        const end = await followedRun.done;

        if (end.type === "error") throw new Error(end.error);

        return { messages: end.messages, text: assistantText(end.messages) };
      }),
    );
  }

  transcriptTurn() {
    return 0;
  }

  async unfinishedMessages(durableId: string) {
    return this.#lives.get(durableId)?.transcript.messages ?? [];
  }

  async cancelRun(durableId: string) {
    const live = this.#lives.get(durableId);

    if (live) this.#stop(live, CANCELLED);
  }

  async close() {
    for (const live of this.#lives.values()) this.#stop(live, CANCELLED);

    this.#sessions.close();
  }

  async #open(options: {
    runId: string;
    threadId: string;
    prompt: string;
    images: readonly string[];
    context: CodexRunContext;
    onEvent: Emit;
    sessionId?: string;
    signal?: AbortSignal;
    queue?: string[];
  }): Promise<FollowedRun> {
    const { context } = options;

    if (!codexAccessToken(context.login)) throw new Error(CODEX_LOGIN_MISSING);

    mkdirSync(this.#home, { recursive: true });
    const durableId = options.runId.startsWith("codex-") ? options.runId : `codex-${options.runId}`;
    const abort = new AbortController();

    if (options.signal) {
      if (options.signal.aborted) abort.abort(options.signal.reason);
      else
        options.signal.addEventListener("abort", () => abort.abort(options.signal?.reason), {
          once: true,
        });
    }

    const box = { onEvent: options.onEvent };
    const hide = hider(context.login, context.redact);
    const transcript = createCodexTranscript((event, source) => box.onEvent(event, source), hide);
    const live: Live = {
      threadId: options.threadId,
      runId: options.runId,
      durableId,
      agentId: `run-${options.runId}`,
      context,
      abort,
      onEvent: options.onEvent,
      transcript,
      host: undefined as unknown as CodexToolHost,
      queue: options.queue ?? [],
      gate: gate(),
      filed: 0,
      settled: false,
    };
    live.onEvent = (event, source) => box.onEvent(event, source);
    const sink = this.#sink(live);
    const tools = hostedTools(context, (task, child) => this.#child(live, task, child));
    live.host = new CodexToolHost(tools, sink);
    live.host.bind(abort.signal);
    this.#lives.set(durableId, live);
    const socketFolder = mkdtempSync(join(tmpdir(), "aven-codex-"));
    const socketPath = join(socketFolder, "tools.sock");
    live.socketFolder = socketFolder;
    live.socketPath = socketPath;

    try {
      live.server = await serveCodexTools(socketPath, live.host);
    } catch (error) {
      this.#lives.delete(durableId);
      rmSync(socketFolder, { recursive: true, force: true });
      throw error;
    }

    void this.#drive(live, options.prompt, options.images, options.sessionId);
    return followed(live);
  }

  async #drive(
    live: Live,
    first: string,
    images: readonly string[],
    sessionId: string | undefined,
  ) {
    let prompt = first;
    let pictures = images;
    const remembered = live.context.rememberSession !== false;
    let resume =
      sessionId ?? (remembered ? this.#sessions.session(live.threadId)?.session_id : undefined);

    try {
      for (;;) {
        await this.#oneTurn(live, prompt, pictures, resume);
        pictures = [];
        resume = this.#sessions.session(live.threadId)?.session_id ?? resume;

        if (live.abort.signal.aborted)
          throw new Error(this.#failure(live, live.abort.signal.reason));

        const next = live.queue.shift();

        if (next) {
          prompt = next;
          continue;
        }

        await Promise.resolve();
        const late = live.queue.shift();

        if (!late) break;

        prompt = late;
      }

      this.#finish(live, { type: "response", messages: this.#unfiled(live) });
    } catch (error) {
      this.#finish(live, { type: "error", error: this.#failure(live, error) });
    }
  }

  async #oneTurn(
    live: Live,
    prompt: string,
    images: readonly string[],
    sessionId: string | undefined,
  ) {
    if (live.abort.signal.aborted) throw live.abort.signal.reason ?? new Error(CANCELLED);

    const env = codexProcessEnv(process.env, this.#home, live.context.login);
    const command = codexMcpCommand(live.socketPath ?? "");
    const thread = codexThreadOptions(live.context.model, this.#home);
    const events = this.#query({
      sessionId,
      prompt,
      images,
      signal: live.abort.signal,
      env,
      config: codexConfig(live.context.instructions, command, env),
      thread,
      callTool: (name, args) => live.host.call(name, args),
    });

    for await (const event of events) {
      if (event.type === "thread.started" && live.context.rememberSession !== false) {
        this.#sessions.save(live.threadId, event.thread_id, live.durableId);
      }

      const failed = live.transcript.apply(event);

      if (failed) throw new Error(failed);

      if (live.transcript.steps() >= CODING_MAX_TURNS) throw new Error(CODEX_TURNS_USED);
    }
  }

  #sink(live: Live): CodexToolSink {
    return {
      started: (id, name, input) => {
        if (live.transcript.steps() >= CODING_MAX_TURNS) {
          live.abort.abort(new Error(CODEX_TURNS_USED));
          throw new Error(CODEX_TURNS_USED);
        }

        live.transcript.countStep();
        const part = { type: "tool-call" as const, toolCallId: id, toolName: name, input };
        const last = live.transcript.messages.at(-1);

        if (last?.role === "assistant" && Array.isArray(last.content)) {
          live.transcript.messages[live.transcript.messages.length - 1] = {
            role: "assistant",
            content: [...last.content, part],
          };
        } else {
          live.transcript.messages.push({ role: "assistant", content: [part] });
        }

        live.onEvent({ type: "tool_start", tool: projectCall(id, name, input) });
      },
      finished: (id, name, output) => {
        live.transcript.messages.push({
          role: "tool",
          content: [{ type: "tool-result", toolCallId: id, toolName: name, output }],
        });
        live.onEvent(projectEnd(id, name, output));
      },
      park: (call) => this.#park(live, call),
    };
  }

  #park(live: Live, call: { id: string; name: string; input: JsonValue }) {
    const pending = Promise.withResolvers<string>();
    const questions = questionsOf(call.input);
    const interactionId = crypto.randomUUID();
    this.#sessions.park(live.threadId, {
      durableId: live.durableId,
      agentId: live.agentId,
      toolCallId: call.id,
      toolName: call.name,
      interactionId,
      questions,
    });
    live.park = { pending };
    const previous = live.gate;
    live.gate = gate();
    live.filed = live.transcript.messages.length;
    previous.resolve({
      type: "interaction",
      continuation: {
        version: 1,
        agentId: live.agentId,
        sourceRunId: live.durableId,
        interaction: {
          type: "tool-question",
          id: interactionId,
          toolName: call.name,
          toolCallId: call.id,
          internalCallId: call.id,
          questions,
        },
        state: { backend: "codex" },
      },
      messages: live.transcript.messages.slice(0, live.filed),
    });
    return pending.promise;
  }

  async #child(
    parent: Live,
    task: SubagentTask,
    child: { index: number; abortSignal?: AbortSignal },
  ) {
    const tools = subagentTools(
      task.type,
      parent.context.tools.filter((tool) => tool.name !== SPAWN_AGENT_TOOL_NAME),
    );
    const followedRun = await this.#open({
      runId: `${parent.runId}-sub-${child.index}-${crypto.randomUUID()}`,
      threadId: `${parent.threadId}-sub-${child.index}`,
      prompt: task.prompt,
      images: [],
      context: {
        ...parent.context,
        tools,
        questions: false,
        children: false,
        rememberSession: false,
        compact: false,
        instructions: codexInstructions({
          ...parent.context.extras,
          role: task.type,
          questions: false,
        }),
      },
      onEvent: (event) => {
        const projected = subagentEvent(child.index, event);

        if (projected) parent.onEvent(projected);
      },
      signal: child.abortSignal,
    });
    const end = await followedRun.done;
    const output = end.type === "error" ? end.error : assistantText(end.messages);
    parent.onEvent({
      type: "subagent",
      index: child.index,
      event: {
        type: "end",
        status: end.type === "error" ? "error" : "done",
        output: clip(output),
      },
    });

    if (end.type === "error") throw new Error(end.error);

    return output;
  }

  #finish(live: Live, end: DurableEnd) {
    if (live.settled) return;

    live.settled = true;

    if (end.type === "error") live.park?.pending.reject(new Error(end.error));

    this.#lives.delete(live.durableId);
    live.server?.close();

    if (live.socketFolder) rmSync(live.socketFolder, { recursive: true, force: true });

    live.gate.resolve(end.type === "error" ? end : { ...end, messages: this.#unfiled(live) });
  }

  #stop(live: Live, message: string) {
    live.abort.abort(new Error(message));
    live.park?.pending.reject(new Error(message));
    this.#finish(live, { type: "error", error: message });
  }

  #failure(live: Live, error: unknown) {
    if (live.abort.signal.aborted) {
      const reason = live.abort.signal.reason;
      return reason instanceof Error ? reason.message : CANCELLED;
    }

    return errorMessage(error);
  }

  #unfiled(live: Live) {
    return live.transcript.messages.slice(live.filed);
  }
}

function hostedTools(
  context: CodexRunContext,
  spawn: RunSubagent,
): CodexRunContext["tools"][number][] {
  const tools = context.tools.filter((tool) => tool.name !== SPAWN_AGENT_TOOL_NAME);

  if (!context.children) return [...tools];

  return [...tools, createSpawnAgentTool(spawn)];
}

function followed(live: Live): FollowedRun {
  return {
    durableId: live.durableId,
    done: live.gate.promise,
    cancel: async () => {
      live.abort.abort(new Error(CANCELLED));
      live.park?.pending.reject(new Error(CANCELLED));
    },
  };
}

function doneNow(runId: string, messages: Message[]): FollowedRun {
  return {
    durableId: `codex-${runId}`,
    done: Promise.resolve({ type: "response", messages }),
    cancel: async () => undefined,
  };
}

function gate(): Gate {
  let resolve: (end: DurableEnd) => void = () => undefined;
  const promise = new Promise<DurableEnd>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function hider(login: string, redact: CodexRunContext["redact"]) {
  const secrets = codexSecretValues(login).sort((left, right) => right.length - left.length);
  return (text: string) => {
    const hidden = secrets.reduce((value, secret) => value.split(secret).join("[redacted]"), text);
    return redact ? redact(hidden) : hidden;
  };
}

export function promptText(prompt: AgentPrompt) {
  if (typeof prompt === "string") return prompt;

  if (typeof prompt.content === "string") return prompt.content;

  return prompt.content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n");
}

function answerText(response: AgentInteractionResponse) {
  if (response.type !== "tool-question") return "The question was not answered.";

  return response.answers.map((answer) => `${answer.questionId}: ${answer.value}`).join("\n");
}

function assistantText(messages: readonly Message[]) {
  const last = messages.findLast((message) => message.role === "assistant");

  if (!last) return "";

  if (typeof last.content === "string") return last.content;

  return last.content.map((part) => (part.type === "text" ? part.text : "")).join("");
}

function questionsOf(input: JsonValue): QuestionPrompt[] {
  const questions =
    typeof input === "object" && input !== null && "questions" in input ? input.questions : [];

  if (!Array.isArray(questions)) return [];

  return questions.flatMap((entry): QuestionPrompt[] => {
    if (typeof entry !== "object" || entry === null || !("id" in entry) || !("text" in entry))
      return [];

    if (typeof entry.id !== "string" || typeof entry.text !== "string") return [];

    const prompt: QuestionPrompt = { id: entry.id, text: entry.text };
    return [prompt];
  });
}

function subagentEvent(index: number, event: RunEvent): RunEvent | undefined {
  if (event.type === "tool_start") {
    return { type: "subagent", index, event: { type: "tool_start", tool: event.tool } };
  }

  if (event.type === "tool_end") {
    return {
      type: "subagent",
      index,
      event: { type: "tool_end", id: event.id, status: event.status },
    };
  }

  return undefined;
}
