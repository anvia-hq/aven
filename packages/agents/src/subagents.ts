import type { AnyTool } from "@anvia/core";
import {
  QUESTION_TOOL_NAME,
  SECRET_TOOL_NAME,
  SHOW_IMAGE_TOOL_NAME,
  SPAWN_AGENT_TOOL_NAME,
} from "@aven/protocol/events";

import type { SandboxToolName } from "./sandbox-tools";
import { DEFINE_GOAL_TOOL_NAME } from "./tools/define-goal";
import { SAVE_ENVIRONMENT_TOOL_NAME } from "./tools/save-environment";

// The kinds of subagent (decision 0057): `explore` looks and reports, `general` can change things.
export const SUBAGENT_TYPES = ["explore", "general"] as const;

export type SubagentType = (typeof SUBAGENT_TYPES)[number];

/** How many steps a subagent may take before it has to answer. */
export const SUBAGENT_MAX_TURNS = 200;

/** How many subagents one `spawn_agent` call may run at once. */
export const MAX_PARALLEL_SUBAGENTS = 6;

// What no subagent has, whatever it is handed: it cannot ask anyone, take on a goal, set the
// environment up, show the user an image or start subagents of its own. The parent does those.
const PARENT_ONLY = new Set<string>([
  QUESTION_TOOL_NAME,
  SECRET_TOOL_NAME,
  DEFINE_GOAL_TOOL_NAME,
  SAVE_ENVIRONMENT_TOOL_NAME,
  SHOW_IMAGE_TOOL_NAME,
  SPAWN_AGENT_TOOL_NAME,
]);

// What an explorer reads with. `exec_command` stays for grep, find and git log; that it only reads
// is the instructions' word, since a shell can write.
const EXPLORE_TOOLS = new Set<string>([
  "exec_command",
  "read_file",
  "list_files",
  "list_ports",
  "list_processes",
  "read_process_logs",
] satisfies SandboxToolName[]);

/** The tools a subagent of this type works with, out of the ones the run's agent has. */
export function subagentTools(type: SubagentType, tools: readonly AnyTool[]): AnyTool[] {
  return tools.filter(
    ({ name }) => !PARENT_ONLY.has(name) && (type === "general" || EXPLORE_TOOLS.has(name)),
  );
}
