import type { AnyTool } from "@anvia/core";
import {
  QUESTION_TOOL_NAME,
  SECRET_TOOL_NAME,
  SHOW_ARTIFACT_TOOL_NAME,
  SPAWN_AGENT_TOOL_NAME,
} from "@aven/protocol/events";

import { COMPUTER_STATUS_TOOL_NAME, COMPUTER_WAKE_TOOL_NAME } from "./tools/computer";
import { DEFINE_GOAL_TOOL_NAME } from "./tools/define-goal";
import { FIND_TOOL_NAME } from "./tools/find";
import { GLOB_TOOL_NAME } from "./tools/glob";
import { GREP_TOOL_NAME } from "./tools/grep";
import { TODO_TOOL_NAME } from "./tools/todo";
import { WEB_FETCH_TOOL_NAME } from "./tools/web-fetch";
import type { SandboxToolName, SubagentType } from "./types";

export const SUBAGENT_TYPES = ["explore", "general"] as const;

export const DEFAULT_SUBAGENT_TYPE: SubagentType = "explore";

export const SUBAGENT_MAX_TURNS = 200;

export const MAX_PARALLEL_SUBAGENTS = 6;

const PARENT_ONLY = new Set<string>([
  QUESTION_TOOL_NAME,
  SECRET_TOOL_NAME,
  DEFINE_GOAL_TOOL_NAME,
  COMPUTER_STATUS_TOOL_NAME,
  COMPUTER_WAKE_TOOL_NAME,
  SHOW_ARTIFACT_TOOL_NAME,
  SPAWN_AGENT_TOOL_NAME,
  TODO_TOOL_NAME,
]);

const EXPLORE_TOOLS = new Set<string>([
  "exec_command",
  "read_file",
  "list_files",
  "list_ports",
  "list_processes",
  "read_process_logs",
] satisfies SandboxToolName[]);

const EXPLORE_OWN_TOOLS = [GREP_TOOL_NAME, FIND_TOOL_NAME, GLOB_TOOL_NAME, WEB_FETCH_TOOL_NAME];

export function subagentTools(type: SubagentType, tools: readonly AnyTool[]): AnyTool[] {
  return tools.filter(
    ({ name }) =>
      !PARENT_ONLY.has(name) &&
      (type === "general" || EXPLORE_TOOLS.has(name) || EXPLORE_OWN_TOOLS.includes(name)),
  );
}
