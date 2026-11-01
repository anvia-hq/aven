import { GOAL_ROUND_NOTE_PREFIX, isGoalRoundNote } from "@aven/protocol/goals";
import type { BotGoalRow } from "@aven/db/schema/bot-goals";

import { describeError } from "../../errors";
import { goalsService } from "./service";

// What a bot is woken with for a round of its goal (decision 0068): that nobody is there, the
// objective and the checks, since each round starts from the bot's notes and its computer's files.
export function roundNote(goal: BotGoalRow, round: number) {
  // The first round carries the whole goal; later ones point to get_goal, so a long objective is not
  // kept in the bot's memory once for every round.
  if (round > 1) {
    return `${GOAL_ROUND_NOTE_PREFIX}${round} of ${goal.maxRounds}. Nobody is watching this round, so do not call ask_question. Carry on with your goal from where earlier rounds left off: get_goal gives the objective and the checks. When the whole objective is achieved, call update_goal with complete (its checks run first); if you cannot go on without the person, call it with blocked and the reason.`;
  }
  return [
    `${GOAL_ROUND_NOTE_PREFIX}${round} of ${goal.maxRounds}. Nobody is watching this round, so do not call ask_question: work on your own computer and keep going.`,
    `Objective: ${goal.objective}`,
    goal.checks.length > 0
      ? `Checks that must pass:\n${goal.checks.map((check) => `- ${check}`).join("\n")}`
      : "There are no automatic checks, so you judge when it is done.",
    "Carry on from where earlier rounds left off (get_goal shows where the goal is). When the whole objective is achieved, call update_goal with complete: its checks run first. If you cannot go on without the person, call update_goal with blocked and the reason. Send a message to the person only for a result or news worth their attention.",
  ].join("\n\n");
}

/**
 * Keeps the goals of bots going (decision 0068). A reply that settles with nothing waiting behind it
 * starts the next round of its bot's goal at once; a tick starts one for a goal nothing is working
 * on, as when the control plane was off or the bot's computer offline. `wake` queues a note as a
 * reply of the bot and throws when it cannot (no model, computer offline); `isIdle` says whether
 * the bot has nothing to answer.
 */
export function createGoalDriver(options: {
  wake(userId: string, botId: string, note: string): Promise<void>;
  isIdle(botId: string): boolean;
  intervalMs: number;
}) {
  const { wake, isIdle, intervalMs } = options;
  let timer: ReturnType<typeof setInterval> | undefined;
  let ticking: Promise<void> | undefined;
  // The bots whose goal could not go on, so an outage is said once and not every tick.
  const failing = new Set<string>();

  // The bot is told why its goal stopped, so it can tell the person; if it cannot be woken, the
  // goal is stopped all the same, and the person finds it so when they ask.
  async function tell(userId: string, botId: string, reason: string) {
    const note = `Your goal stopped: ${reason} Tell the person how far it got and what you need. They can ask you to continue it.`;
    await wake(userId, botId, note).catch((error: unknown) => {
      console.warn(`Bot ${botId} could not be told its goal stopped:`, describeError(error));
    });
  }

  // Starts the next round of the bot's active goal, or stops it when no round is left.
  async function advance(userId: string, botId: string) {
    const goal = await goalsService.claimRound(botId);
    if (!goal) {
      const current = await goalsService.current(botId);
      if (current?.phase === "active" && current.roundsStarted >= current.maxRounds) {
        const reason = `It reached its ${current.maxRounds}-round limit.`;
        if (await goalsService.block(botId, reason)) await tell(userId, botId, reason);
      }
      return;
    }
    try {
      await wake(userId, botId, roundNote(goal, goal.roundsStarted));
      failing.delete(botId);
    } catch (error) {
      // Not started, so not counted: the tick tries again.
      await goalsService.releaseRound(botId);
      if (!failing.has(botId)) {
        console.warn(`A round of the goal of bot ${botId} could not start:`, describeError(error));
      }
      failing.add(botId);
    }
  }

  async function tick() {
    for (const { userId, botId } of await goalsService.activeBots()) {
      if (!isIdle(botId)) continue;
      await advance(userId, botId).catch((error: unknown) => {
        console.warn(`The goal of bot ${botId} could not go on:`, describeError(error));
      });
    }
  }

  const guarded = () => {
    ticking ??= tick()
      .catch((error: unknown) => console.warn("A goal tick failed:", describeError(error)))
      .finally(() => (ticking = undefined));
    return ticking;
  };

  return {
    advance,
    tick,
    /**
     * A reply of the bot has ended and nothing waits behind it. A round that failed stops the goal,
     * as there is no one to see it fail; any other reply that failed leaves it as it is.
     */
    async settled(reply: { userId: string; botId: string; prompt: string; ok: boolean }) {
      const { userId, botId, prompt, ok } = reply;
      if (ok) return advance(userId, botId);
      if (!isGoalRoundNote(prompt)) return;
      const reason = "A round failed.";
      if (await goalsService.block(botId, reason)) await tell(userId, botId, reason);
    },
    start() {
      if (timer) return;
      void guarded();
      timer = setInterval(() => void guarded(), intervalMs);
      timer.unref();
    },
    async close() {
      clearInterval(timer);
      timer = undefined;
      await ticking;
    },
  };
}

export type GoalDriver = ReturnType<typeof createGoalDriver>;
