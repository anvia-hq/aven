import { Agent, createQuestionTool, type AnyTool, type RetrySetting } from "@anvia/core";

import { compactionFor, resolveAgentModel } from "./agent-model";
import { forkInstructions } from "./fork-instruction";
import { environmentInstructions } from "./environment";
import { mcpInstructions } from "./mcp";
import { memoryInstructions } from "./memory";
import { codingInstructions } from "./instruction";
import { CODING_MAX_TURNS } from "./turn-limits";
import { createSecretRequestTool } from "./tools/request-secret";
import { CODING_SUMMARY_INSTRUCTIONS } from "./compaction-instructions";
import { forPaths, SANDBOX_PATHS } from "./sandbox-paths";
import { skillsInstructions } from "./skills";
import { createWebSearchTool } from "./tools/web-search";
import type { McpNote, ModelSource, SandboxPaths, SkillListing } from "./types";
import type { RunMemory, RunWebSearch } from "@aven/protocol/types";

type CodingAgentOptions = ModelSource & {
  tools: readonly AnyTool[];
  webSearch?: RunWebSearch;
  questions?: boolean;
  maxTurns?: number;
  retries?: RetrySetting;
  id?: string;
  instructions?: string;
  skills?: readonly SkillListing[];
  skillsUnavailable?: readonly string[];
  envNames?: readonly string[];
  mcp?: McpNote;
  forks?: boolean;
  memory?: RunMemory;
  paths?: SandboxPaths;
};

export function createCodingAgent(options: CodingAgentOptions) {
  const tools = [...options.tools];

  if (options.webSearch) tools.push(createWebSearchTool({ apiKey: options.webSearch.apiKey }));

  if (options.questions ?? true) tools.push(createQuestionTool(), createSecretRequestTool());

  const maxTurns = options.maxTurns ?? CODING_MAX_TURNS;
  const agentModel = resolveAgentModel(options);
  const agent = new Agent({
    ...agentModel,
    retries: options.retries ?? agentModel.retries,
    id: options.id ?? "coding",
    instructions: forPaths(
      [
        options.instructions ?? codingInstructions(maxTurns, options.questions ?? true),
        skillsInstructions(options.skills ?? [], options.skillsUnavailable),
        environmentInstructions(options.envNames ?? []),
        mcpInstructions(options.mcp),
        memoryInstructions(options.memory),
        options.forks ? forkInstructions() : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
      options.paths ?? SANDBOX_PATHS,
    ),
    maxTurns,
    tools,
  });

  return {
    agent,
    compaction: compactionFor(options, agentModel.model, undefined, CODING_SUMMARY_INSTRUCTIONS),
  };
}
