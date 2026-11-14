import { createTool } from "@anvia/core";
import { z } from "zod";

export const DEFINE_GOAL_TOOL_NAME = "define_goal";

export const goalRequestSchema = z.object({
  objective: z
    .string()
    .min(1)
    .describe("What must be true when the work is done. Include everything later sessions need."),
  acceptanceCriteria: z
    .array(z.string().min(1))
    .min(1)
    .describe("Observable conditions that show the objective is met."),
  verifyCommands: z
    .array(z.string().min(1))
    .max(10)
    .optional()
    .describe(
      "Shell commands that must all exit 0 once the work is done (tests, typecheck, build). Strongly recommended: without them the goal ends when the agent says it is done.",
    ),
  maxSessions: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("How many working sessions to allow. Defaults to 20."),
});

export type GoalRequest = z.infer<typeof goalRequestSchema>;

export function createDefineGoalTool(onDefine: (goal: GoalRequest) => void) {
  return createTool({
    name: DEFINE_GOAL_TOOL_NAME,
    description: `Hand a large task to a long-running goal: Aven keeps working on it across many sessions, with fresh context each time, and checks the verify commands itself before it calls the goal done.

Use it for work that needs many edit-and-verify cycles (a feature, a migration, a refactor across many files) or a long look around before you can start (setting an environment up), and when you are running low on turns for the message. Not for a quick change you can finish now.
After calling it, end your turn with one short sentence saying what you started. Do not keep working: the goal takes over, you will not be able to ask the user questions while it runs, and you are asked to report on it when it ends.`,
    inputSchema: goalRequestSchema,
    handler: (goal) => {
      onDefine(goal);
      return "Goal recorded. It starts when you end this turn.";
    },
  });
}
