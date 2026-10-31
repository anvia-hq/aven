import {
  Agent,
  createQuestionTool,
  createSummaryMemoryCompactor,
  type AgentMemoryOptions,
  type AnyTool,
  type CompletionModel,
} from "@anvia/core";

import { azureApiFor, createModel, providerOptionsFor, type ModelConfig } from "./model";
import { environmentInstructions } from "./environment";
import { INSTRUCTIONS } from "./instruction";
import { ownedByResponsesApi, withAnthropicReasoning, withOwnReasoning } from "./own-reasoning";
import { createSecretRequestTool } from "./tools/request-secret";
import { skillsInstructions, type SkillListing } from "./skills";
import { createWebSearchTool } from "./tools/web-search";

type CodingAgentOptions = (ModelConfig | { model: CompletionModel }) & {
  /** What the agent can do: files, commands and processes in its sandbox, supplied by the host. */
  tools: readonly AnyTool[];
  /** Enable `web_search`. Defaults to whether `TAVILY_API_KEY` is set. */
  webSearch?: boolean;
  /** Give the agent `ask_user` and `request_secret`, which suspend the run until the user answers. Defaults to on. */
  questions?: boolean;
  maxTurns?: number;
  /** The agent's id. A durable run registers one agent per run, so each needs its own. Defaults to "coding". */
  id?: string;
  /** What the agent is told instead of the coding agent's own instructions: a subagent has its own (decision 0057). */
  instructions?: string;
  /** Where the agent keeps its conversation itself, for a host that runs it with a `session` (a bot, decision 0058). Old history in it is summarized like a thread's. */
  memory?: AgentMemoryOptions;
  /** The history size, in tokens, past which it is summarized, instead of 70% of the model's context window. */
  compactAfterTokens?: number;
  /** The skills in the sandbox, which the instructions list (decision 0035). */
  skills?: readonly SkillListing[];
  /** The names of the project's environment variables, which the instructions list; never their values (decision 0045). */
  envNames?: readonly string[];
};

// Model requests that fail transiently (rate limits, dropped connections) are tried this many times.
const MODEL_REQUEST_ATTEMPTS = 5;

// Assembles the model and tools. Hosts own the run loop: start runs with `agent.stream()`.
export function createCodingAgent(options: CodingAgentOptions) {
  const tools = [...options.tools];
  if (options.webSearch ?? Boolean(process.env.TAVILY_API_KEY)) tools.push(createWebSearchTool());

  if (options.questions ?? true) tools.push(createQuestionTool(), createSecretRequestTool());

  const { model, providerOptions, controls } = resolveModel(options);
  const compaction = compactionFor(options, model);
  const agent = new Agent({
    id: options.id ?? "coding",
    model,
    instructions: [
      options.instructions ?? INSTRUCTIONS,
      skillsInstructions(options.skills ?? []),
      environmentInstructions(options.envNames ?? []),
    ]
      .filter(Boolean)
      .join("\n\n"),
    providerOptions,
    controls,
    maxTurns: options.maxTurns ?? 50,
    retries: { maxAttempts: MODEL_REQUEST_ATTEMPTS },
    memory: options.memory && compaction ? { ...options.memory, compaction } : options.memory,
    tools,
  });

  // For a host that keeps the history itself (a durable run): what to register beside the agent.
  return { agent, compaction };
}

// Summarizing starts at this share of the model's context window, leaving room for the next
// request and the summary itself.
const COMPACT_AT = 0.7;

// Old history is summarized by the run's own model once it passes the trigger: the size the host
// gave, else 70% of the model's context window. Without either there is nothing to measure
// against, so history is left whole.
function compactionFor(options: CodingAgentOptions, model: CompletionModel) {
  const contextWindow = "contextWindow" in options ? options.contextWindow : undefined;
  const afterTokens =
    options.compactAfterTokens ??
    (contextWindow ? Math.floor(contextWindow * COMPACT_AT) : undefined);
  if (!afterTokens) return undefined;
  return {
    trigger: { afterTokens },
    compactor: createSummaryMemoryCompactor({ model }),
  };
}

// What a thread's earlier runs left may be another provider's reasoning, which this one rejects.
function withHistoryItOwns(model: CompletionModel, config: ModelConfig) {
  if (config.provider === "anthropic") return withAnthropicReasoning(model);
  const responses =
    config.provider === "openai" ||
    (config.provider === "azure" && azureApiFor(config.modelId ?? "") === "responses");
  return responses ? withOwnReasoning(model, ownedByResponsesApi) : model;
}

// A ready model carries no provider settings; a model config also picks the provider's options
// and the reasoning effort.
function resolveModel(options: CodingAgentOptions) {
  if ("model" in options)
    return { model: options.model, providerOptions: undefined, controls: undefined };
  return {
    model: withHistoryItOwns(createModel(options), options),
    providerOptions: providerOptionsFor(options.provider),
    controls: options.reasoningEffort ? { reasoningEffort: options.reasoningEffort } : undefined,
  };
}
