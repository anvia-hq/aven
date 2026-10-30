import { createTool } from "@anvia/core";
import { z } from "zod";

export const SAVE_ENVIRONMENT_TOOL_NAME = "save_environment";

/** Runs the repository's `.aven/setup` in a fresh setup container and keeps the result as the snapshot. */
export type SaveEnvironment = (abortSignal?: AbortSignal) => Promise<unknown>;

// Saves the repository's environment (decision 0043): the host runs the setup script in a fresh
// container, so what is kept is what the script makes, and new threads on the repository start
// from it. The agent cannot do this itself: its own container cannot install system packages.
export function createSaveEnvironmentTool(save: SaveEnvironment) {
  return createTool({
    name: SAVE_ENVIRONMENT_TOOL_NAME,
    description:
      "Run the repository's .aven/setup script in a fresh setup container (where sudo and apt work, which they do not in your own sandbox) and keep the result as the environment that new threads on this repository start from. Call it after you have written .aven/setup, make it executable first. It can take many minutes. If the script fails, the error holds the end of its output: fix the script and call this again.",
    inputSchema: z.object({}),
    async execute(_input, context) {
      await save(context?.abortSignal);
      return {
        saved: true,
        // Said in words so the agent does not have to work out what happened.
        summary:
          "The environment is saved. New threads on this repository start from it for the next 72 hours, then it is made again from .aven/setup, so commit the .aven folder.",
      };
    },
  });
}
