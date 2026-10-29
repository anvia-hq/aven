import { Agent, type AnyTool, type CompletionModel, type MemoryStore } from "@anvia/core";

import type { JobRegistry } from "./jobs/job-registry";
import { createModel, providerOptionsFor, type ModelConfig } from "./model";
import { createEditTool } from "./tools/edit";
import { createReadTool } from "./tools/read";
import { createShellTools } from "./tools/shell";
import { createWebSearchTool } from "./tools/web-search";
import { createWriteTool } from "./tools/write";

export type CodingAgentOptions = (ModelConfig | { model: CompletionModel }) & {
  /** Project directory the file tools are confined to and the shell starts in. */
  root: string;
  /**
   * Where commands run and background jobs are observed. Required, so no caller falls back to
   * running the agent's commands on the host by accident; pass `new JobRegistry()` to do so on purpose.
   */
  jobs: JobRegistry;
  /** Enable `web_search`. Defaults to whether `TAVILY_API_KEY` is set. */
  webSearch?: boolean;
  /** More tools for the agent, such as a sandbox's desktop. */
  extraTools?: readonly AnyTool[];
  maxTurns?: number;
  /** Persist conversations; see `createMemoryStore`. Omit for stateless runs. */
  memory?: MemoryStore;
};

const INSTRUCTIONS = `You are a coding agent working in a project directory.
- Read files before editing them. Prefer the read, edit and write tools over shell commands for files.
- Make small, focused changes and verify them by running the project's checks with the shell tool.
- Run long-lived commands (dev servers, watchers, slow builds) in the background and keep working; you are notified when they finish, so do not poll.
- Be concise. Say what you changed and anything you could not verify.`;

// Assembles the model and tools. Hosts own the run loop: start runs with `agent.stream()` and, when
// a background job finishes (`jobs.onComplete`), deliver `formatJobNotice(job)` with `stream.steer()`
// while the run is live, or start a new run if it has ended.
export function createCodingAgent(options: CodingAgentOptions) {
  const { jobs } = options;
  const { shell, shellOutput, shellKill } = createShellTools({ root: options.root, jobs });

  const tools: AnyTool[] = [
    createReadTool({ root: options.root }),
    createWriteTool({ root: options.root }),
    createEditTool({ root: options.root }),
    shell,
    shellOutput,
    shellKill,
  ];
  if (options.webSearch ?? Boolean(process.env.TAVILY_API_KEY)) tools.push(createWebSearchTool());
  if (options.extraTools) tools.push(...options.extraTools);

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

  return { agent, jobs };
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
