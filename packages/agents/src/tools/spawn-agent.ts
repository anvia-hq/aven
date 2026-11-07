import { createTool } from "@anvia/core";
import { SPAWN_AGENT_TOOL_NAME } from "@aven/protocol/events";
import { z } from "zod";

import { MAX_PARALLEL_SUBAGENTS, SUBAGENT_TYPES } from "../subagents";
import { errorMessage } from "../values";
import type { RunSubagent, SubagentResult } from "./types";

export const subagentTaskSchema = z.object({
  description: z
    .string()
    .min(1)
    .max(80)
    .describe(
      "Three to eight words naming the task, shown to the user: 'Find the auth middleware'.",
    ),
  prompt: z
    .string()
    .min(1)
    .describe(
      "The whole task. The subagent has none of your conversation: say what you want, what you already know, where to look and what to send back.",
    ),
  type: z
    .enum(SUBAGENT_TYPES)
    .describe(
      "explore: only reads and reports, for searching and understanding code. general: can run commands and change files.",
    ),
});

export type SubagentTask = z.infer<typeof subagentTaskSchema>;

export const spawnAgentSchema = z.object({
  tasks: z
    .array(subagentTaskSchema)
    .min(1)
    .max(MAX_PARALLEL_SUBAGENTS)
    .describe(
      `Up to ${MAX_PARALLEL_SUBAGENTS} tasks. All of them start at once, and you get every result back together.`,
    ),
});

const NOTHING = "The subagent finished without saying anything.";

export function createSpawnAgentTool(run: RunSubagent) {
  return createTool({
    name: SPAWN_AGENT_TOOL_NAME,
    description: `Hand tasks to subagents: agents that work on their own with a clean context, in this sandbox, and send you back only their last message. Their searching and reading never fills your context, and several work at once.

Use it to search or understand a large codebase, to look into several independent questions in parallel, or for a self-contained piece of work that would take many steps. Do not use it for something you can do in one or two steps, or for work that needs what the user and you have said: a subagent knows only its prompt.
- Several tasks in one call run at the same time, up to ${MAX_PARALLEL_SUBAGENTS}. Give tasks that change files separate files; explorers can overlap freely.
- Write each prompt as a full brief: the goal, what you know, where to look, what to send back. A vague prompt gets a vague answer.
- The user does not see what a subagent sends you. Read it, check what matters, and tell the user the result yourself.
- A subagent cannot ask the user anything or start subagents of its own.`,
    inputSchema: spawnAgentSchema,
    async execute({ tasks }, context) {
      const results = await Promise.all(
        tasks.map(async (task, index): Promise<SubagentResult> => {
          const { description, type } = task;
          try {
            const output = await run(task, { index, abortSignal: context?.abortSignal });
            return { description, type, status: "done", output: output.trim() || NOTHING };
          } catch (error) {
            return { description, type, status: "error", error: errorMessage(error) };
          }
        }),
      );
      context?.abortSignal?.throwIfAborted();
      return { results };
    },
  });
}
