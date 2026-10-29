import { Agent, type AnyTool, type CompletionModel, type MemoryStore } from "@anvia/core";

import { createModel, providerOptionsFor, type ModelConfig } from "./model";
import { createWebSearchTool } from "./tools/web-search";

export type CodingAgentOptions = (ModelConfig | { model: CompletionModel }) & {
  /** What the agent can do: files, commands and processes in its sandbox, supplied by the host. */
  tools: readonly AnyTool[];
  /** Enable `web_search`. Defaults to whether `TAVILY_API_KEY` is set. */
  webSearch?: boolean;
  maxTurns?: number;
  /** Persist conversations; see `createMemoryStore`. Omit for stateless runs. */
  memory?: MemoryStore;
};

const INSTRUCTIONS = `You are a coding agent working in a sandbox with a project workspace.
- Read files before editing them. Prefer read_file, edit and write_file over shell commands for files.
- Make small, focused changes and verify them by running the project's checks with exec_command.
- Run long-lived commands (dev servers, watchers) with start_process, not exec_command. Check on them with read_process_logs, list_processes and wait_for_port, and stop them with stop_process. Nothing tells you when a process ends: look when it matters.
- Be concise. Say what you changed and anything you could not verify.`;

// Assembles the model and tools. Hosts own the run loop: start runs with `agent.stream()`.
export function createCodingAgent(options: CodingAgentOptions) {
  const tools = [...options.tools];
  if (options.webSearch ?? Boolean(process.env.TAVILY_API_KEY)) tools.push(createWebSearchTool());

  const { model, providerOptions, controls } = resolveModel(options);
  const agent = new Agent({
    id: "coding",
    model,
    instructions: INSTRUCTIONS,
    providerOptions,
    controls,
    maxTurns: options.maxTurns ?? 50,
    tools,
    memory: options.memory && { store: options.memory, savePolicy: "turn" },
  });

  return { agent };
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
