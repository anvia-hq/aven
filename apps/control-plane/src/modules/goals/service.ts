import { db } from "@aven/db/client";
import { botGoals } from "@aven/db/schema/bot-goals";
import { GOAL_DEFAULT_ROUNDS, GOAL_MAX_ROUNDS } from "@aven/protocol/goals";
import { and, eq, inArray, lt, sql } from "drizzle-orm";

import { UnprocessableError } from "../../errors";
import type { GoalInput } from "./types";
import type { BotGoalRow } from "@aven/db/schema/types";
import type { BotGoalView, GoalAction, GoalPhase } from "@aven/protocol/types";

const FROM: Record<GoalAction, GoalPhase[]> = {
  complete: ["active", "paused", "blocked"],
  blocked: ["active", "paused"],
  pause: ["active"],
  resume: ["paused", "blocked"],
  clear: ["active", "paused", "blocked", "complete"],
};

const ACTION_VERB: Record<GoalAction, string> = {
  complete: "complete",
  blocked: "block",
  pause: "pause",
  resume: "resume",
  clear: "clear",
};

const UNFINISHED: GoalPhase[] = ["active", "paused", "blocked"];

export function goalView(row: BotGoalRow): BotGoalView {
  return {
    objective: row.objective,
    checks: row.checks,
    phase: row.phase as GoalPhase,
    blockedReason: row.blockedReason,
    round: row.roundsStarted,
    maxRounds: row.maxRounds,
  };
}

export const goalsService = {
  async current(botId: string) {
    const [row] = await db.select().from(botGoals).where(eq(botGoals.botId, botId));
    return row && row.phase !== "cleared" ? row : null;
  },

  async get(botId: string) {
    const row = await goalsService.current(botId);
    return row ? goalView(row) : null;
  },

  async start(userId: string, botId: string, input: GoalInput) {
    const existing = await goalsService.current(botId);

    if (existing && UNFINISHED.includes(existing.phase as GoalPhase)) {
      throw new UnprocessableError("You already have a goal. Finish, block or clear it first.");
    }

    const values = {
      userId,
      botId,
      objective: input.objective,
      checks: input.checks,
      phase: "active",
      blockedReason: null,
      roundsStarted: 0,
      maxRounds: Math.min(input.maxRounds ?? GOAL_DEFAULT_ROUNDS, GOAL_MAX_ROUNDS),
    };
    const [row] = await db
      .insert(botGoals)
      .values(values)
      .onConflictDoUpdate({
        target: botGoals.botId,
        set: { ...values, createdAt: new Date() },
        setWhere: inArray(botGoals.phase, ["complete", "cleared"]),
      })
      .returning();

    if (!row) {
      throw new UnprocessableError("You already have a goal. Finish, block or clear it first.");
    }

    return goalView(row);
  },

  async update(botId: string, action: GoalAction, reason?: string) {
    const goal = await goalsService.current(botId);

    if (!goal) throw new UnprocessableError("You have no goal.");

    if (action === "complete" && goal.phase === "complete") return goalView(goal);

    if (!FROM[action].includes(goal.phase as GoalPhase)) {
      throw new UnprocessableError(
        `The goal is ${goal.phase}, so you cannot ${ACTION_VERB[action]} it.`,
      );
    }

    const why = reason?.trim();

    if (action === "blocked" && !why)
      throw new UnprocessableError("Say what is blocking the goal.");

    const changes: Partial<BotGoalRow> = {};

    if (action === "complete") changes.phase = "complete";

    if (action === "blocked") Object.assign(changes, { phase: "blocked", blockedReason: why });

    if (action === "pause") changes.phase = "paused";

    if (action === "clear") changes.phase = "cleared";

    if (action === "resume") {
      Object.assign(changes, {
        phase: "active",
        blockedReason: null,
        maxRounds:
          goal.roundsStarted >= goal.maxRounds
            ? Math.min(goal.roundsStarted + GOAL_DEFAULT_ROUNDS, GOAL_MAX_ROUNDS)
            : goal.maxRounds,
      });
    }

    const [row] = await db
      .update(botGoals)
      .set(changes)
      .where(and(eq(botGoals.id, goal.id), eq(botGoals.phase, goal.phase)))
      .returning();

    if (!row) throw new UnprocessableError("The goal changed meanwhile; look at it again.");

    return row.phase === "cleared" ? null : goalView(row);
  },

  async claimRound(botId: string) {
    const [row] = await db
      .update(botGoals)
      .set({ roundsStarted: sql`${botGoals.roundsStarted} + 1` })
      .where(
        and(
          eq(botGoals.botId, botId),
          eq(botGoals.phase, "active"),
          lt(botGoals.roundsStarted, botGoals.maxRounds),
        ),
      )
      .returning();
    return row ?? null;
  },

  async releaseRound(botId: string) {
    await db
      .update(botGoals)
      .set({ roundsStarted: sql`greatest(${botGoals.roundsStarted} - 1, 0)` })
      .where(eq(botGoals.botId, botId));
  },

  async block(botId: string, reason: string) {
    const rows = await db
      .update(botGoals)
      .set({ phase: "blocked", blockedReason: reason })
      .where(and(eq(botGoals.botId, botId), eq(botGoals.phase, "active")))
      .returning({ id: botGoals.id });
    return rows.length > 0;
  },

  activeBots() {
    return db
      .select({ userId: botGoals.userId, botId: botGoals.botId })
      .from(botGoals)
      .where(eq(botGoals.phase, "active"));
  },
};
