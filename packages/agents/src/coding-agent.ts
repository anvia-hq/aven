import {
  Agent,
  createQuestionTool,
  createSummaryMemoryCompactor,
  type AnyTool,
  type CompletionModel,
  type MemoryStore,
} from "@anvia/core";

import { withoutStoredReasoning } from "./memory";
import { createModel, providerOptionsFor, type ModelConfig } from "./model";
import { createWebSearchTool } from "./tools/web-search";

export type CodingAgentOptions = (ModelConfig | { model: CompletionModel }) & {
  /** What the agent can do: files, commands and processes in its sandbox, supplied by the host. */
  tools: readonly AnyTool[];
  /** Enable `web_search`. Defaults to whether `TAVILY_API_KEY` is set. */
  webSearch?: boolean;
  /** Give the agent `ask_user`, which suspends the run until the user answers. Defaults to on. */
  questions?: boolean;
  maxTurns?: number;
  /** The agent's id. A durable run registers one agent per run, so each needs its own. Defaults to "coding". */
  id?: string;
  /** Persist conversations; see `createMemoryStore`. Omit for stateless runs, and for durable ones, which keep their own history. */
  memory?: MemoryStore;
};

// Model requests that fail transiently (rate limits, dropped connections) are tried this many times.
const MODEL_REQUEST_ATTEMPTS = 5;

const INSTRUCTIONS = `You are a coding agent working in a sandbox with a project workspace.
- Read files before editing them. Prefer read_file, edit and write_file over shell commands for files.
- Make small, focused changes and verify them by running the project's checks with exec_command.
- Run long-lived commands (dev servers, watchers) with start_process, not exec_command. Check on them with read_process_logs, list_processes and wait_for_port, and stop them with stop_process. Nothing tells you when a process ends: look when it matters.
- When you cannot go on without the user's input, ask with ask_user; otherwise decide and say what you chose.
- Be concise. Say what you changed and anything you could not verify.`;

// Assembles the model and tools. Hosts own the run loop: start runs with `agent.stream()`.
export function createCodingAgent(options: CodingAgentOptions) {
  const tools = [...options.tools];
  if (options.webSearch ?? Boolean(process.env.TAVILY_API_KEY)) tools.push(createWebSearchTool());

  if (options.questions ?? true) tools.push(createQuestionTool());

  const { model, providerOptions, controls } = resolveModel(options);
  const store = historyStoreFor(options);
  const agent = new Agent({
    id: options.id ?? "coding",
    model,
    instructions: INSTRUCTIONS,
    providerOptions,
    controls,
    maxTurns: options.maxTurns ?? 50,
    retries: { maxAttempts: MODEL_REQUEST_ATTEMPTS },
    tools,
    memory: store && {
      store,
      savePolicy: "turn",
      compaction: store.compaction && compactionFor(options, model),
    },
  });

  // For a host that keeps the history itself (a durable run): what to register beside the agent.
  return { agent, compaction: compactionFor(options, model) };
}

// Summarizing starts at this share of the model's context window, leaving room for the next
// request and the summary itself.
const COMPACT_AT = 0.7;

// Old history is summarized by the run's own model once it passes the trigger. Without a known
// context window there is nothing to measure against, so history is left whole.
function compactionFor(options: CodingAgentOptions, model: CompletionModel) {
  const contextWindow = "contextWindow" in options ? options.contextWindow : undefined;
  if (!contextWindow) return undefined;
  return {
    trigger: { afterTokens: Math.floor(contextWindow * COMPACT_AT) },
    compactor: createSummaryMemoryCompactor({ model }),
  };
}

// Anthropic rejects thinking replayed from an earlier run, so its runs start without it.
export function historyStoreFor(options: CodingAgentOptions) {
  const { memory } = options;
  const anthropic = "provider" in options && options.provider === "anthropic";
  return memory && anthropic ? withoutStoredReasoning(memory) : memory;
}

// A ready model carries no provider settings; a model config also picks the provider's options
// and the reasoning effort.
function resolveModel(options: CodingAgentOptions) {
  if ("model" in options)
    return { model: options.model, providerOptions: undefined, controls: undefined };
  return {
    model: createModel(options),
    providerOptions: providerOptionsFor(options.provider),
    controls: options.reasoningEffort ? { reasoningEffort: options.reasoningEffort } : undefined,
  };
}

export type CodingAgent = ReturnType<typeof createCodingAgent>["agent"];
export type CodingAgentStream = ReturnType<CodingAgent["stream"]>;
