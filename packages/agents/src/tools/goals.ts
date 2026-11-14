import { createTool } from "@anvia/core";
import {
  GOAL_CHECK_MAX,
  GOAL_CHECKS_MAX,
  GOAL_DEFAULT_ROUNDS,
  GOAL_MAX_ROUNDS,
  GOAL_OBJECTIVE_MAX,
  GOAL_REASON_MAX,
} from "@aven/protocol/goals";
import { z } from "zod";
import type { GoalHost } from "./types";
import type { GoalAction } from "@aven/protocol/types";

export const GET_GOAL_TOOL_NAME = "get_goal";
export const START_GOAL_TOOL_NAME = "start_goal";
export const UPDATE_GOAL_TOOL_NAME = "update_goal";

const startSchema = z.object({
  objective: z
    .string()
    .trim()
    .min(1)
    .max(GOAL_OBJECTIVE_MAX)
    .describe(
      "The specific outcome, with everything a later round needs, since each round starts from your notes and your computer's files.",
    ),
  checks: z
    .array(z.string().trim().min(1).max(GOAL_CHECK_MAX))
    .max(GOAL_CHECKS_MAX)
    .optional()
    .describe(
      "Shell commands, run on your computer, that pass only when the work is done. May be empty.",
    ),
  maxRounds: z
    .number()
    .int()
    .min(1)
    .max(GOAL_MAX_ROUNDS)
    .optional()
    .describe(`Round cap. Defaults to ${GOAL_DEFAULT_ROUNDS}.`),
});

const updateSchema = z.object({
  action: z.enum(["complete", "blocked", "pause", "resume", "clear"]),
  reason: z.string().trim().max(GOAL_REASON_MAX).optional().describe("For blocked."),
});

export function createGoalTools(host: GoalHost) {
  const get = createTool({
    name: GET_GOAL_TOOL_NAME,
    description: "Read your current goal, or null when you have none.",
    inputSchema: z.object({}),
    handler: async () => ({ goal: await host.get() }),
  });
  const start = createTool({
    name: START_GOAL_TOOL_NAME,
    description:
      "Start a long-running goal for big or multi-step work you do on your own computer. After this reply ends, the app keeps waking you for round after round in the background, without the person, until your checks pass and you call update_goal complete, you are blocked, or the round cap is reached. Use it for work that will not fit one reply; not for questions or small tasks. You can have one goal at a time.",
    inputSchema: startSchema,
    handler: async (input) => ({
      goal: await host.start({ ...input, checks: input.checks ?? [] }),
      next: "Goal started. Tell the person in one short message what you will work on in the background, then stop; the first round starts after this reply.",
    }),
  });
  const update = createTool({
    name: UPDATE_GOAL_TOOL_NAME,
    description:
      "Change your goal. complete: the whole objective is achieved (its checks run first on your computer). blocked: you cannot go on without the person; give the reason. pause, resume and clear: only when the person asks, in a chat reply.",
    inputSchema: updateSchema,
    handler: async ({ action, reason }, { abortSignal }) => {
      if (action === "complete") {
        const goal = await host.get();

        if (goal && goal.phase !== "complete" && goal.checks.length > 0) {
          if (!host.check) throw new Error("You have no computer to run the checks on.");

          const failed = await host.check(goal.checks, abortSignal);

          if (failed.length > 0) {
            return {
              goal,
              next: `The goal is not complete: these checks failed. Fix them and call complete again.\n\n${failed.join("\n\n")}`,
            };
          }
        }
      }

      const goal = await host.update(action, reason);
      return { goal, next: NEXT[action] };
    },
  });
  return [get, start, update] as const;
}

const NEXT: Record<GoalAction, string> = {
  complete: "The goal is complete. Tell the person what was achieved.",
  blocked: "The goal is blocked and its rounds stop. Tell the person what you need from them.",
  pause: "The goal is paused.",
  resume: "The goal is active again; the next round starts after this reply.",
  clear: "The goal is cleared.",
};
