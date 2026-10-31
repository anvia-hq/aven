import type { ToolCallPart, ToolResultOutput } from "@anvia/core";

import {
  QUESTION_TOOL_NAME,
  SECRET_TOOL_NAME,
  SHOW_IMAGE_TOOL_NAME,
  SPAWN_AGENT_TOOL_NAME,
  type DiffLine,
  type QuestionPrompt,
  type RunEvent,
  type SubagentPart,
  type ToolImage,
  type ToolPart,
} from "@aven/protocol/events";

import type { SandboxToolName } from "./sandbox-tools";
import { DEFINE_GOAL_TOOL_NAME } from "./tools/define-goal";
import { EDIT_TOOL_NAME } from "./tools/edit";
import { GIT_FETCH_TOOL_NAME } from "./tools/git-fetch";
import { SAVE_ENVIRONMENT_TOOL_NAME } from "./tools/save-environment";
import { WEB_SEARCH_TOOL_NAME } from "./tools/web-search";
import { asRecord } from "./values";

// What a client is sent of a tool result; the model sees the full output.
const MAX_UI_OUTPUT_CHARS = 4000;
const MAX_DIFF_LINES = 60;

const asString = (value: unknown) => (typeof value === "string" ? value : "");

// The sandbox's tools (from @anvia/sandbox) and what each one acts on, for the line a client shows.
const PATH_TOOLS = new Set<string>([
  "read_file",
  "write_file",
  "list_files",
  EDIT_TOOL_NAME,
  SHOW_IMAGE_TOOL_NAME,
] satisfies (SandboxToolName | typeof EDIT_TOOL_NAME | typeof SHOW_IMAGE_TOOL_NAME)[]);
const COMMAND_TOOLS = new Set<string>([
  "exec_command",
  "start_process",
] satisfies SandboxToolName[]);
const PROCESS_TOOLS = new Set<string>([
  "read_process_logs",
  "stop_process",
] satisfies SandboxToolName[]);
const PORT_TOOL: SandboxToolName = "wait_for_port";
// Tools whose JSON result carries a `summary` meant to be read as it is.
const SUMMARISED_TOOLS = new Set<string>([GIT_FETCH_TOOL_NAME, SAVE_ENVIRONMENT_TOOL_NAME]);

export function toolTarget(name: string, input: unknown) {
  const args = asRecord(input);
  if (PATH_TOOLS.has(name)) return asString(args.path);
  if (COMMAND_TOOLS.has(name)) return asString(args.command);
  if (PROCESS_TOOLS.has(name)) return asString(args.processId);
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

// The questions of an `ask_user` call, as the model wrote them. Anything malformed is left out.
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

// The tasks of a `spawn_agent` call as they begin: every subagent is there, working, from the start.
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

function clip(text: string) {
  return text.length > MAX_UI_OUTPUT_CHARS
    ? `${text.slice(0, MAX_UI_OUTPUT_CHARS)}\n… [truncated]`
    : text;
}

// The text a human would read from a tool's structured result; anything unfamiliar is shown as JSON.
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

// What each subagent of a finished `spawn_agent` call said, from the call's result.
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

/**
 * `spawn_agent`'s tool part with how each subagent ended, from the call's result: a rebuilt
 * transcript has no live events. When the call itself failed, none of them finished.
 */
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

// The image a result of the image tool carries, when it has one of the right shape. Only that
// tool's result is read this way: another tool's JSON may have an `image` of its own.
function imageOf(value: unknown): ToolImage | undefined {
  const { name, mediaType, caption } = asRecord(asRecord(value).image);
  if (typeof name !== "string" || typeof mediaType !== "string") return undefined;
  return typeof caption === "string" ? { name, mediaType, caption } : { name, mediaType };
}

function commandText(result: Record<string, unknown>) {
  const parts = [asString(result.stdout), asString(result.stderr)].filter(Boolean);
  if (result.status === "timed_out") parts.push("[timed out]");
  else if (result.exitCode !== 0) parts.push(`[exit ${String(result.exitCode)}]`);
  return parts.join("\n");
}

// What the UI shows for a tool result: the text a human would read, never the raw payload.
export function projectToolOutput(
  output: ToolResultOutput,
  toolName?: string,
): {
  status: "done" | "error";
  output: string;
  image?: ToolImage;
} {
  switch (output.type) {
    case "text":
      return { status: "done", output: clip(output.value) };
    case "error-text":
      return { status: "error", output: clip(output.value) };
    case "json": {
      const image = toolName === SHOW_IMAGE_TOOL_NAME ? imageOf(output.value) : undefined;
      if (image) {
        return { status: "done", output: `Showed ${asString(asRecord(output.value).path)}`, image };
      }
      // What these tools did, in the words they gave it.
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
        // Images and files (a desktop screenshot) are not sent to clients; say that one was there.
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

/** The end of a tool call as a client sees it: how it went and what it said. */
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
