import { Agent, createQuestionTool, type AnyTool } from "@anvia/core";

import { compactionFor, resolveAgentModel, type ModelSource } from "./agent-model";
import { environmentInstructions } from "./environment";
import { codingInstructions } from "./instruction";
import { CODING_MAX_TURNS } from "./turn-limits";
import { createSecretRequestTool } from "./tools/request-secret";
import { skillsInstructions, type SkillListing } from "./skills";
import { createWebSearchTool } from "./tools/web-search";

type CodingAgentOptions = ModelSource & {
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
  /** The skills in the sandbox, which the instructions list (decision 0035). */
  skills?: readonly SkillListing[];
  /** The names of the project's environment variables, which the instructions list; never their values (decision 0045). */
  envNames?: readonly string[];
};

// Assembles the model and tools. Hosts own the run loop: start runs with `agent.stream()`.
export function createCodingAgent(options: CodingAgentOptions) {
  const tools = [...options.tools];
  if (options.webSearch ?? Boolean(process.env.TAVILY_API_KEY)) tools.push(createWebSearchTool());

  if (options.questions ?? true) tools.push(createQuestionTool(), createSecretRequestTool());

  const maxTurns = options.maxTurns ?? CODING_MAX_TURNS;
  const agentModel = resolveAgentModel(options);
  const agent = new Agent({
    ...agentModel,
    id: options.id ?? "coding",
    instructions: [
      // A run with a person to answer to (`questions`) is the one that has `define_goal`.
      options.instructions ?? codingInstructions(maxTurns, options.questions ?? true),
      skillsInstructions(options.skills ?? []),
      environmentInstructions(options.envNames ?? []),
    ]
      .filter(Boolean)
      .join("\n\n"),
    maxTurns,
    tools,
  });

  // For a host that keeps the history itself (a durable run): what to register beside the agent.
  return { agent, compaction: compactionFor(options, agentModel.model) };
}
