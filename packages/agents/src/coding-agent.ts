import { Agent, type AnyTool, type CompletionModel, type MemoryStore } from "@anvia/core";

import { JobRegistry } from "./jobs/job-registry";
import { createModel, providerOptionsFor, type ModelConfig } from "./model";
import { createEditTool } from "./tools/edit";
import { createReadTool } from "./tools/read";
import { createShellTools } from "./tools/shell";
import { createWebSearchTool } from "./tools/web-search";
import { createWriteTool } from "./tools/write";

export type CodingAgentOptions = (ModelConfig | { model: CompletionModel }) & {
  /** Project directory the file tools are confined to and the shell starts in. */
  root: string;
  /** Share a registry to observe background jobs; one is created when omitted. */
  jobs?: JobRegistry;
  /** Enable `web_search`. Defaults to whether `TAVILY_API_KEY` is set. */
  webSearch?: boolean;
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
  const jobs = options.jobs ?? new JobRegistry();
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

  const agent = new Agent({
    id: "coding",
    model: "model" in options ? options.model : createModel(options),
    instructions: INSTRUCTIONS,
    providerOptions: "provider" in options ? providerOptionsFor(options.provider) : undefined,
    controls:
      "provider" in options && options.reasoningEffort
        ? { reasoningEffort: options.reasoningEffort }
        : undefined,
    maxTurns: options.maxTurns ?? 50,
    tools,
    memory: options.memory && { store: options.memory, savePolicy: "turn" },
  });

  return { agent, jobs };
}

export type CodingAgent = ReturnType<typeof createCodingAgent>["agent"];
export type CodingAgentStream = ReturnType<CodingAgent["stream"]>;
