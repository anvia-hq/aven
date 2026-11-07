import { createTool } from "@anvia/core";
import { z } from "zod";

export const SAVE_ENVIRONMENT_TOOL_NAME = "save_environment";

type SaveEnvironment = (abortSignal?: AbortSignal) => Promise<unknown>;

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
        summary:
          "The environment is saved. New threads on this repository start from it for the next 72 hours, then it is made again from .aven/setup, so commit the .aven folder.",
      };
    },
  });
}
