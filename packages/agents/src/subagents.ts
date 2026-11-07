import type { AnyTool } from "@anvia/core";
import {
  QUESTION_TOOL_NAME,
  SECRET_TOOL_NAME,
  SHOW_ARTIFACT_TOOL_NAME,
  SPAWN_AGENT_TOOL_NAME,
} from "@aven/protocol/events";

import { DEFINE_GOAL_TOOL_NAME } from "./tools/define-goal";
import { SAVE_ENVIRONMENT_TOOL_NAME } from "./tools/save-environment";
import type { SandboxToolName, SubagentType } from "./types";

export const SUBAGENT_TYPES = ["explore", "general"] as const;

export const SUBAGENT_MAX_TURNS = 200;

export const MAX_PARALLEL_SUBAGENTS = 6;

const PARENT_ONLY = new Set<string>([
  QUESTION_TOOL_NAME,
  SECRET_TOOL_NAME,
  DEFINE_GOAL_TOOL_NAME,
  SAVE_ENVIRONMENT_TOOL_NAME,
  SHOW_ARTIFACT_TOOL_NAME,
  SPAWN_AGENT_TOOL_NAME,
]);

const EXPLORE_TOOLS = new Set<string>([
  "exec_command",
  "read_file",
  "list_files",
  "list_ports",
  "list_processes",
  "read_process_logs",
] satisfies SandboxToolName[]);

export function subagentTools(type: SubagentType, tools: readonly AnyTool[]): AnyTool[] {
  return tools.filter(
    ({ name }) => !PARENT_ONLY.has(name) && (type === "general" || EXPLORE_TOOLS.has(name)),
  );
}
