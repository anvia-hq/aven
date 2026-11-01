import { db } from "@aven/db/client";
import { botGoals, type BotGoalRow } from "@aven/db/schema/bot-goals";
import {
  GOAL_DEFAULT_ROUNDS,
  GOAL_MAX_ROUNDS,
  type BotGoalView,
  type GoalAction,
  type GoalPhase,
} from "@aven/protocol/goals";
import { and, eq, inArray, lt, sql } from "drizzle-orm";

import { UnprocessableError } from "../../errors";

export type GoalInput = { objective: string; checks: string[]; maxRounds?: number };

// Where each action may be taken from. A goal that is complete stays so until the bot starts another.
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

// A bot's goal is its own, found by the bot, which the control plane knows from the reply (decision
// 0068): a runner cannot name another's.
export const goalsService = {
  // The bot's goal, unless it was cleared.
  async current(botId: string) {
    const [row] = await db.select().from(botGoals).where(eq(botGoals.botId, botId));
    return row && row.phase !== "cleared" ? row : null;
  },

  async get(botId: string) {
    const row = await goalsService.current(botId);
    return row ? goalView(row) : null;
  },

  // A bot has one goal at a time; a finished one is replaced.
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
    // The one row of the bot is written over, so two goals started at once leave one, and the
    // second finds the first's goal unfinished.
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

  // The bot changes its goal. What each action needs of where the goal is, and of the reason, is held here.
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
        // A goal that ran out of rounds gets more, so the next round does not block it again; one
        // that stopped with rounds left keeps its cap.
        maxRounds:
          goal.roundsStarted >= goal.maxRounds
            ? goal.roundsStarted + GOAL_DEFAULT_ROUNDS
            : goal.maxRounds,
      });
    }
    // Only from the phase read, so a change that came in between is not written over.
    const [row] = await db
      .update(botGoals)
      .set(changes)
      .where(and(eq(botGoals.id, goal.id), eq(botGoals.phase, goal.phase)))
      .returning();
    if (!row) throw new UnprocessableError("The goal changed meanwhile; look at it again.");
    return row.phase === "cleared" ? null : goalView(row);
  },

  // The next round of an active goal, counted: null when it is not active or has no round left.
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

  // A round that could not be started is not counted.
  async releaseRound(botId: string) {
    await db
      .update(botGoals)
      .set({ roundsStarted: sql`greatest(${botGoals.roundsStarted} - 1, 0)` })
      .where(eq(botGoals.botId, botId));
  },

  // Stops an active goal, for a reason the bot is told. False when it was not active.
  async block(botId: string, reason: string) {
    const rows = await db
      .update(botGoals)
      .set({ phase: "blocked", blockedReason: reason })
      .where(and(eq(botGoals.botId, botId), eq(botGoals.phase, "active")))
      .returning({ id: botGoals.id });
    return rows.length > 0;
  },

  // The bots with a goal to work on, for a control plane that was off while they did.
  activeBots() {
    return db
      .select({ userId: botGoals.userId, botId: botGoals.botId })
      .from(botGoals)
      .where(eq(botGoals.phase, "active"));
  },
};
