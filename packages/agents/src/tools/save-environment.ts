import { createTool } from "@anvia/core";
import { z } from "zod";

export const SAVE_ENVIRONMENT_TOOL_NAME = "save_environment";

export function createSaveEnvironmentTool(save: (signal?: AbortSignal) => Promise<string>) {
  return createTool({
    name: SAVE_ENVIRONMENT_TOOL_NAME,
    description: `Run the repository's .aven/setup in a clean environment (with CI=1 and AVEN_CLOUD=1) on this Aven Cloud computer and keep the resulting disk as the environment that new threads of this project start from, for 72 hours.

System packages, toolchains, and home-directory caches (such as ~/.bun, ~/.cache, ~/.local) carry over. Each new thread still gets a fresh clone in its own workspace folder, so workspace-local files (node_modules, .venv, .env) are hydrated per thread by .aven/resume from those warm caches. Call this after verifying .aven/setup. It runs the script now, so a failing script fails here with the end of its output: fix it and call this again. On a person's own computer there is no snapshot, so the tool is not offered there.`,
    inputSchema: z.object({}),
    async handler(_input, context) {
      return save(context?.abortSignal);
    },
  });
}
