import type { ToolPart } from "./types";

const FORK_TOOL = "fork_thread";

export function forkIdOf(tool: ToolPart) {
  if (tool.name !== FORK_TOOL || tool.status !== "done" || !tool.output) return undefined;
  try {
    const { id } = JSON.parse(tool.output) as { id?: unknown };
    return typeof id === "string" ? id : undefined;
  } catch {
    return undefined;
  }
}
