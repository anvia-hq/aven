import type { AnyTool } from "@anvia/core";

import { boundResult } from "./bounded-result";

export function lateBoundTools(
  tools: readonly AnyTool[],
  current: () => readonly AnyTool[] | undefined,
  unavailable: (name: string) => string = (name) =>
    `The thread's sandbox is not running, so ${name} is unavailable`,
): AnyTool[] {
  return tools.map((tool) => ({
    name: tool.name,
    requiresApproval: tool.requiresApproval,
    definition: (prompt) => tool.definition(prompt),
    parseInput: tool.parseInput && ((args) => tool.parseInput!(args)),
    call: async (args, context) => {
      const live = current()?.find((candidate) => candidate.name === tool.name);

      if (!live) throw new Error(unavailable(tool.name));

      return boundResult(await live.call(args, context));
    },
  }));
}

export const boundedTools = (tools: readonly AnyTool[]) => lateBoundTools(tools, () => tools);

export function wakingTools(tools: readonly AnyTool[], wake: () => Promise<unknown>): AnyTool[] {
  return tools.map((tool) => ({
    name: tool.name,
    requiresApproval: tool.requiresApproval,
    definition: (prompt) => tool.definition(prompt),
    parseInput: tool.parseInput && ((args) => tool.parseInput!(args)),
    call: async (args, context) => {
      await wake();
      return tool.call(args, context);
    },
  }));
}
