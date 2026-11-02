import type { AnyTool } from "@anvia/core";

import { boundResult } from "./bounded-result";

// A run that stops on the agent's question stays in the journal with the agent it started with,
// and that agent cannot be replaced until the run is over (decision 0021). Its tools would still
// point at the sandbox of the run that asked, which may have been released since. These stand-ins
// keep the same names and descriptions but call whichever sandbox the thread has now, and keep
// what they return small enough for the journal.
export function lateBoundTools(
  tools: readonly AnyTool[],
  current: () => readonly AnyTool[] | undefined,
  // What the agent is told when the tool is not there to call: the sandbox's, unless said.
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
      // What the run's journal can keep is limited; a command's output may not fit.
      return boundResult(await live.call(args, context));
    },
  }));
}

// The same tools with what they return kept small. For a host that keeps what the tools returned,
// such as a bot's conversation, rather than a journal.
export const boundedTools = (tools: readonly AnyTool[]) => lateBoundTools(tools, () => tools);
