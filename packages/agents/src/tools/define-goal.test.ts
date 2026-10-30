import { describe, expect, test } from "bun:test";

import { createDefineGoalTool, goalRequestSchema, type GoalRequest } from "./define-goal";

describe("define_goal", () => {
  test("hands the goal to the host and says it starts after the turn", async () => {
    const received: GoalRequest[] = [];
    const tool = createDefineGoalTool((goal) => received.push(goal));
    const goal = {
      objective: "Add pagination",
      acceptanceCriteria: ["The list endpoint takes a cursor"],
      verifyCommands: ["bun test"],
    };
    expect(await tool.call(goal)).toContain("starts when you end this turn");
    expect(received).toEqual([goal]);
  });

  test("a goal needs an objective and at least one criterion", () => {
    expect(goalRequestSchema.safeParse({ objective: "x", acceptanceCriteria: [] }).success).toBe(
      false,
    );
    expect(goalRequestSchema.safeParse({ objective: "", acceptanceCriteria: ["y"] }).success).toBe(
      false,
    );
  });
});
