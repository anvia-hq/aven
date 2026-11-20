import type { AnyTool } from "@anvia/core";

export function wrapTools(
  tools: readonly AnyTool[],
  call: (
    tool: AnyTool,
    args: unknown,
    context: Parameters<AnyTool["call"]>[1],
  ) => ReturnType<AnyTool["call"]>,
): AnyTool[] {
  return tools.map((tool) => ({
    name: tool.name,
    requiresApproval: tool.requiresApproval,
    definition: (prompt) => tool.definition(prompt),
    parseInput: tool.parseInput && ((args) => tool.parseInput!(args)),
    call: (args, context) => call(tool, args, context),
  }));
}
