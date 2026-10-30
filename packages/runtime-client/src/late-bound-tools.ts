import type { AnyTool } from "@anvia/core";

// A run that stops on the agent's question stays in the journal with the agent it started with,
// and that agent cannot be replaced until the run is over (decision 0021). Its tools would still
// point at the sandbox of the run that asked, which may have been released since. These stand-ins
// keep the same names and descriptions but call whichever sandbox the thread has now.
export function lateBoundTools(
  tools: readonly AnyTool[],
  current: () => readonly AnyTool[] | undefined,
): AnyTool[] {
  return tools.map((tool) => ({
    name: tool.name,
    requiresApproval: tool.requiresApproval,
    definition: (prompt) => tool.definition(prompt),
    parseInput: tool.parseInput && ((args) => tool.parseInput!(args)),
    call: (args, context) => {
      const live = current()?.find((candidate) => candidate.name === tool.name);
      if (!live)
        throw new Error(`The thread's sandbox is not running, so ${tool.name} is unavailable`);
      return live.call(args, context);
    },
  }));
}
