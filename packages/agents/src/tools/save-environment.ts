import { createTool } from "@anvia/core";
import { z } from "zod";

export const SAVE_ENVIRONMENT_TOOL_NAME = "save_environment";

export function createSaveEnvironmentTool(save: (signal?: AbortSignal) => Promise<string>) {
  return createTool({
    name: SAVE_ENVIRONMENT_TOOL_NAME,
    description: `Run the repository's .aven/setup in a clean environment on this Aven Cloud computer and keep what it makes as the environment that new threads of this project start from, for 72 hours.

A new thread starts from that environment and still gets a fresh clone and its own branch, so dependencies, tools and build output carry over but no files and no sign-in do. Call it after you have written .aven/setup and made it executable. It runs the script now, so a failing script fails here with the end of its output: fix it and call this again. On the person's own computer there is no snapshot, so the tool is not offered there.`,
    inputSchema: z.object({}),
    async handler(_input, context) {
      return save(context?.abortSignal);
    },
  });
}
