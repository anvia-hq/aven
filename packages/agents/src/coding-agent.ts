import { Agent, createQuestionTool, type AnyTool, type RetrySetting } from "@anvia/core";

import { compactionFor, resolveAgentModel } from "./agent-model";
import { forkInstructions } from "./fork-instruction";
import { environmentInstructions } from "./environment";
import { mcpInstructions } from "./mcp";
import { memoryInstructions } from "./memory";
import { codingInstructions } from "./instruction";
import { CODING_MAX_TURNS } from "./turn-limits";
import { createOpenBrowserTool } from "./tools/open-browser";
import { createSecretRequestTool } from "./tools/request-secret";
import { CODING_SUMMARY_INSTRUCTIONS } from "./compaction-instructions";
import { forPaths, SANDBOX_PATHS } from "./sandbox-paths";
import { lensObservability } from "./lens";
import { skillsInstructions } from "./skills";
import { createWebSearchTool } from "./tools/web-search";
import type { MachineProvider, McpNote, ModelSource, SandboxPaths, SkillListing } from "./types";
import type { RunLens, RunMemory, RunWebSearch } from "@aven/protocol/types";

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
  project?: string;
  lens?: RunLens;
  paths?: SandboxPaths;
  machine?: MachineProvider;
};

export function createCodingAgent(options: CodingAgentOptions) {
  const tools = [...options.tools];

  if (options.webSearch) tools.push(createWebSearchTool({ apiKey: options.webSearch.apiKey }));

  if (options.questions ?? true)
    tools.push(createQuestionTool(), createSecretRequestTool(), createOpenBrowserTool());

  const maxTurns = options.maxTurns ?? CODING_MAX_TURNS;
  const agentModel = resolveAgentModel(options);
  const agent = new Agent({
    ...agentModel,
    retries: options.retries ?? agentModel.retries,
    id: options.id ?? "coding",
    instructions: forPaths(
      [
        options.instructions ??
          codingInstructions(maxTurns, options.questions ?? true, options.machine),
        skillsInstructions(options.skills ?? [], options.skillsUnavailable),
        environmentInstructions(options.envNames ?? []),
        mcpInstructions(options.mcp),
        memoryInstructions(options.memory),
        options.project ?? "",
        options.forks ? forkInstructions() : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
      options.paths ?? SANDBOX_PATHS,
    ),
    maxTurns,
    observability: lensObservability(options.lens),
    tools,
  });

  return {
    agent,
    compaction: compactionFor(options, agentModel.model, undefined, CODING_SUMMARY_INSTRUCTIONS),
  };
}
