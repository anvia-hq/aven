import type { ToolCallPart, ToolResultOutput } from "@anvia/core";

import {
  QUESTION_TOOL_NAME,
  SECRET_TOOL_NAME,
  SHOW_ARTIFACT_TOOL_NAME,
  SHOW_IMAGE_TOOL_NAME,
  SPAWN_AGENT_TOOL_NAME,
} from "@aven/protocol/events";

import { DEFINE_GOAL_TOOL_NAME } from "./tools/define-goal";
import { EDIT_TOOL_NAME } from "./tools/edit";
import { GIT_FETCH_TOOL_NAME } from "./tools/git-fetch";
import { SAVE_ENVIRONMENT_TOOL_NAME } from "./tools/save-environment";
import { WAIT_FOR_FORKS_TOOL_NAME } from "./tools/wait-for-forks";
import { WEB_SEARCH_TOOL_NAME } from "./tools/web-search";
import { asRecord } from "./values";
import type { SandboxToolName } from "./types";
import type {
  DiffLine,
  QuestionPrompt,
  RunEvent,
  SubagentPart,
  ToolArtifact,
  ToolPart,
} from "@aven/protocol/types";

const MAX_UI_OUTPUT_CHARS = 4000;
const MAX_DIFF_LINES = 60;

const asString = (value: unknown) => (typeof value === "string" ? value : "");

const PATH_TOOLS = new Set<string>([
  "read_file",
  "write_file",
  "list_files",
  EDIT_TOOL_NAME,
  SHOW_IMAGE_TOOL_NAME,
] satisfies (SandboxToolName | typeof EDIT_TOOL_NAME | typeof SHOW_IMAGE_TOOL_NAME)[]);
const artifactTarget = (args: Record<string, unknown>) => {
  const items = Array.isArray(args.items) ? args.items : [];
  return items
    .map((item) => asString(asRecord(item).path))
    .filter(Boolean)
    .join(", ");
};
const COMMAND_TOOLS = new Set<string>([
  "exec_command",
  "start_process",
] satisfies SandboxToolName[]);
const PROCESS_TOOLS = new Set<string>([
  "read_process_logs",
  "stop_process",
] satisfies SandboxToolName[]);
const PORT_TOOL: SandboxToolName = "wait_for_port";
const WAIT_FOR_PROCESS_TOOL_NAME = "wait_for_process";
const SUMMARISED_TOOLS = new Set<string>([
  GIT_FETCH_TOOL_NAME,
  SAVE_ENVIRONMENT_TOOL_NAME,
  WAIT_FOR_PROCESS_TOOL_NAME,
  WAIT_FOR_FORKS_TOOL_NAME,
]);

export function toolTarget(name: string, input: unknown) {
  const args = asRecord(input);
  if (PATH_TOOLS.has(name)) return asString(args.path);
  if (name === SHOW_ARTIFACT_TOOL_NAME) return artifactTarget(args);
  if (COMMAND_TOOLS.has(name)) return asString(args.command);
  if (PROCESS_TOOLS.has(name) || name === WAIT_FOR_PROCESS_TOOL_NAME) {
    return asString(args.processId);
  }
  if (name === WEB_SEARCH_TOOL_NAME) return asString(args.query);
  if (name === DEFINE_GOAL_TOOL_NAME) return asString(args.objective);
  if (name === GIT_FETCH_TOOL_NAME) return asString(args.branch) || "default branch";
  if (name === PORT_TOOL) return String(args.containerPort ?? "");
  return "";
}

function editDiff(input: unknown): DiffLine[] | undefined {
  const args = asRecord(input);
  if (typeof args.oldString !== "string" || typeof args.newString !== "string") return undefined;
  const lines = (text: string, type: DiffLine["type"]) =>
    text.split("\n").map((line) => ({ type, text: line }));
  return [...lines(args.oldString, "del"), ...lines(args.newString, "add")].slice(
    0,
    MAX_DIFF_LINES,
  );
}

function questionsOf(input: unknown): QuestionPrompt[] {
  const { questions } = asRecord(input);
  if (!Array.isArray(questions)) return [];
  return questions.flatMap((entry): QuestionPrompt[] => {
    const question = asRecord(entry);
    if (typeof question.id !== "string" || typeof question.text !== "string") return [];
    const choices = Array.isArray(question.choices)
      ? question.choices.flatMap((choice) => {
          const { label, value } = asRecord(choice);
          return typeof label === "string" && typeof value === "string" ? [{ label, value }] : [];
        })
      : undefined;
    const prompt: QuestionPrompt = { id: question.id, text: question.text };
    if (choices?.length) prompt.choices = choices;
    if (question.allowCustom === true) prompt.allowCustom = true;
    return [prompt];
  });
}

function subagentsOf(input: unknown): SubagentPart[] {
  const { tasks } = asRecord(input);
  if (!Array.isArray(tasks)) return [];
  return tasks.map((entry, index) => {
    const task = asRecord(entry);
    return {
      index,
      description: asString(task.description),
      type: asString(task.type),
      status: "running",
      tools: [],
    };
  });
}

export function projectToolCall(call: ToolCallPart): ToolPart {
  const tool: ToolPart = {
    id: call.toolCallId,
    name: call.toolName,
    target: toolTarget(call.toolName, call.input),
    status: "running",
  };
  if (call.toolName === EDIT_TOOL_NAME) {
    const diff = editDiff(call.input);
    if (diff) tool.diff = diff;
  }
  if (call.toolName === QUESTION_TOOL_NAME || call.toolName === SECRET_TOOL_NAME) {
    tool.questions = questionsOf(call.input);
  }
  if (call.toolName === SPAWN_AGENT_TOOL_NAME) {
    tool.subagents = subagentsOf(call.input);
    tool.target = tool.subagents.length === 1 ? "1 task" : `${tool.subagents.length} tasks`;
  }
  return tool;
}

export function clip(text: string) {
  return text.length > MAX_UI_OUTPUT_CHARS
    ? `${text.slice(0, MAX_UI_OUTPUT_CHARS)}\n… [truncated]`
    : text;
}

function jsonText(value: unknown) {
  const result = asRecord(value);
  if (result.status === "exited" || result.status === "timed_out") return commandText(result);
  if (typeof result.content === "string") return result.content;
  if (typeof result.bytesWritten === "number") {
    return `Wrote ${result.bytesWritten} bytes to ${asString(result.path)}`;
  }
  if (Array.isArray(result.entries)) {
    return result.entries
      .map((entry) => `${asString(asRecord(entry).type)}\t${asString(asRecord(entry).path)}`)
      .join("\n");
  }
  return JSON.stringify(value);
}

function subagentResults(value: unknown) {
  const { results } = asRecord(value);
  if (!Array.isArray(results)) return [];
  return results.map((entry) => {
    const result = asRecord(entry);
    return result.status === "error"
      ? { status: "error" as const, output: clip(asString(result.error)) }
      : { status: "done" as const, output: clip(asString(result.output)) };
  });
}

export function withSubagentResults(tool: ToolPart, output: ToolResultOutput): ToolPart {
  if (!tool.subagents) return tool;
  const results = output.type === "json" ? subagentResults(output.value) : [];
  return {
    ...tool,
    subagents: tool.subagents.map((subagent) => {
      const result = results[subagent.index];
      return { ...subagent, status: result?.status ?? "error", output: result?.output };
    }),
  };
}

function artifactOf(value: unknown): ToolArtifact | undefined {
  const { name, mediaType, caption } = asRecord(value);
  if (typeof name !== "string" || typeof mediaType !== "string") return undefined;
  return typeof caption === "string" ? { name, mediaType, caption } : { name, mediaType };
}

function shownOf(value: unknown, toolName?: string) {
  const result = asRecord(value);
  if (toolName === SHOW_IMAGE_TOOL_NAME) {
    const image = artifactOf(result.image);
    return image && { artifacts: [image], said: `Showed ${asString(result.path)}` };
  }
  if (toolName !== SHOW_ARTIFACT_TOOL_NAME || !Array.isArray(result.artifacts)) return undefined;
  const artifacts = result.artifacts.flatMap((item) => artifactOf(item) ?? []);
  if (artifacts.length === 0) return undefined;
  const failed = Array.isArray(result.failed) ? result.failed.length : 0;
  return {
    artifacts,
    said: failed
      ? `Showed ${artifacts.length} of ${artifacts.length + failed}`
      : `Showed ${artifacts.length}`,
  };
}

function commandText(result: Record<string, unknown>) {
  const parts = [asString(result.stdout), asString(result.stderr)].filter(Boolean);
  if (result.status === "timed_out") parts.push("[timed out]");
  else if (result.exitCode !== 0) parts.push(`[exit ${String(result.exitCode)}]`);
  return parts.join("\n");
}

export function projectToolOutput(
  output: ToolResultOutput,
  toolName?: string,
): {
  status: "done" | "error";
  output: string;
  artifacts?: ToolArtifact[];
} {
  switch (output.type) {
    case "text":
      return { status: "done", output: clip(output.value) };
    case "error-text":
      return { status: "error", output: clip(output.value) };
    case "json": {
      const shown = shownOf(output.value, toolName);
      if (shown) return { status: "done", output: shown.said, artifacts: shown.artifacts };
      if (toolName === SPAWN_AGENT_TOOL_NAME) {
        const results = subagentResults(output.value);
        const failed = results.filter(({ status }) => status === "error").length;
        return {
          status: "done",
          output: failed
            ? `${results.length - failed} finished, ${failed} failed`
            : `${results.length} finished`,
        };
      }
      const said =
        toolName && SUMMARISED_TOOLS.has(toolName) ? asString(asRecord(output.value).summary) : "";
      return { status: "done", output: clip(said || jsonText(output.value)) };
    }
    case "error-json":
      return { status: "error", output: clip(JSON.stringify(output.value)) };
    case "content":
      return {
        status: "done",
        output: clip(
          output.value
            .map((part) => (part.type === "text" ? part.text : `[${part.type}]`))
            .join(""),
        ),
      };
    case "execution-denied":
      return { status: "error", output: output.reason ?? "Tool call was denied" };
    default:
      return assertNever(output);
  }
}

export function projectToolEnd(
  id: string,
  output: ToolResultOutput,
  toolName?: string,
): Extract<RunEvent, { type: "tool_end" }> {
  return { type: "tool_end", id, ...projectToolOutput(output, toolName) };
}

function assertNever(value: never): never {
  throw new Error(`Unhandled tool result: ${JSON.stringify(value)}`);
}
