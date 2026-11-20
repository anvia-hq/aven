import { createCodingAgent } from "@aven/agents/coding-agent";
import { createCompactionAgent } from "@aven/agents/compaction-agent";
import { subagentInstructions } from "@aven/agents/subagent-instruction";
import { SUBAGENT_MAX_TURNS } from "@aven/agents/subagents";

import type { CreateRuntimeAgent } from "../types";

export const defaultCreateAgent =
  (origin: string): CreateRuntimeAgent =>
  ({
    id,
    attended,
    tools,
    skills,
    skillsUnavailable,
    envNames,
    paths,
    machine,
    mcp,
    memory,
    project,
    webSearch,
    lens,
    forks,
    model,
    role,
    compact,
  }) => {
    if (!model) throw new Error("The control plane sent no model for this run");

    if (compact) {
      return createCompactionAgent({
        id,
        provider: model.provider,
        modelId: model.modelId,
        apiKey: model.gatewayToken,
        baseUrl: `${origin}${model.gatewayPath}`,
        reasoningEffort: model.reasoningEffort,
        effortLevels: model.effortLevels,
        contextWindow: model.contextWindow,
      });
    }

    return createCodingAgent({
      id,
      retries: role ? undefined : false,
      questions: attended,
      instructions: role && subagentInstructions(role, machine),
      machine,
      maxTurns: role && SUBAGENT_MAX_TURNS,
      provider: model.provider,
      modelId: model.modelId,
      apiKey: model.gatewayToken,
      baseUrl: `${origin}${model.gatewayPath}`,
      reasoningEffort: model.reasoningEffort,
      effortLevels: model.effortLevels,
      contextWindow: model.contextWindow,
      tools,
      skills,
      skillsUnavailable,
      envNames,
      paths,
      mcp,
      memory,
      project,
      webSearch,
      lens,
      forks,
    });
  };
