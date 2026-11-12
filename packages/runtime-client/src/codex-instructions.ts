import { forkInstructions } from "@aven/agents/fork-instruction";
import { environmentInstructions } from "@aven/agents/environment";
import { codingInstructions } from "@aven/agents/instruction";
import { mcpInstructions } from "@aven/agents/mcp";
import { memoryInstructions } from "@aven/agents/memory";
import { forPaths, SANDBOX_PATHS } from "@aven/agents/sandbox-paths";
import { skillsInstructions } from "@aven/agents/skills";
import { subagentInstructions } from "@aven/agents/subagent-instruction";
import { SUBAGENT_MAX_TURNS } from "@aven/agents/subagents";
import { CODING_MAX_TURNS } from "@aven/agents/turn-limits";
import type { SubagentType } from "@aven/agents/types";

import type { CodexInstructionExtras } from "./types";

const AVEN_TOOLS = `<tools>
Use only the tools on the MCP server named aven. Your own shell, file editor and image viewer are turned off, and you cannot write or run anything outside those tools. read_file, edit, write_file, exec_command, view_image and the other aven tools are how you work on this computer.
</tools>`;

export function codexInstructions(
  options: CodexInstructionExtras & {
    role?: SubagentType;
    questions?: boolean;
    maxTurns?: number;
  } = {},
) {
  const role = options.role;
  const maxTurns = options.maxTurns ?? (role ? SUBAGENT_MAX_TURNS : CODING_MAX_TURNS);
  const questions = options.questions ?? !role;
  const base = role ? subagentInstructions(role) : codingInstructions(maxTurns, questions);
  const budget = role ? `You have ${maxTurns} steps for this task.` : "";
  return forPaths(
    [
      base,
      budget,
      AVEN_TOOLS,
      skillsInstructions(options.skills ?? [], options.skillsUnavailable),
      environmentInstructions(options.envNames ?? []),
      mcpInstructions(options.mcp),
      memoryInstructions(options.memory),
      options.forks ? forkInstructions() : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
    options.paths ?? SANDBOX_PATHS,
  );
}
