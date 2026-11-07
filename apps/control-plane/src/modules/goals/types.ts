import type { createGoalDriver } from "./driver";

export type GoalDriver = ReturnType<typeof createGoalDriver>;

export type GoalInput = { objective: string; checks: string[]; maxRounds?: number };
