import { db } from "@aven/db/client";
import { botSchedules, type BotScheduleRow } from "@aven/db/schema/bot-schedules";
import { SCHEDULE_CATCH_UP_MS, type ScheduleStatus } from "@aven/protocol/schedules";
import { and, asc, eq, isNotNull, lte } from "drizzle-orm";

import { describeError } from "../../errors";
import { describeTime, nextRun } from "./cron";

const LATE_MS = 2 * 60_000;
const TICK_LIMIT = 100;

function scheduleNote(schedule: BotScheduleRow, due: Date, late: boolean) {
  return [
    `Scheduled task "${schedule.name}" (schedule id ${schedule.id}) is due now, set for ${describeTime(due, schedule.timezone)}.`,
    late
      ? "It is running late because the app was off or busy when it was due. Do it now anyway."
      : "",
    "Nobody is watching this run, so do not call ask_question: make reasonable choices and finish. Do not message the person just to say you started. Send a short message only to say what you found or did, or why you could not.",
    `The task:\n${schedule.prompt}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function createScheduler(options: {
  fire(schedule: { userId: string; botId: string }, note: string): Promise<void>;
  isBusy(botId: string): boolean;
  intervalMs: number;
  now?: () => Date;
}) {
  const { fire, isBusy, intervalMs } = options;
  const clock = options.now ?? (() => new Date());
  let timer: ReturnType<typeof setInterval> | undefined;
  let ticking: Promise<void> | undefined;

  async function handle(schedule: BotScheduleRow, now: Date) {
    const due = schedule.nextRunAt!;
    const lateness = now.getTime() - due.getTime();
    const [claimed] = await db
      .update(botSchedules)
      .set({ nextRunAt: nextRun(schedule.cron, schedule.timezone, now) })
      .where(and(eq(botSchedules.id, schedule.id), eq(botSchedules.nextRunAt, due)))
      .returning({ id: botSchedules.id });
    if (!claimed) return;

    let status: ScheduleStatus;
    if (isBusy(schedule.botId)) status = "busy";
    else if (lateness > SCHEDULE_CATCH_UP_MS) status = "missed";
    else {
      status = lateness > LATE_MS ? "late" : "started";
      try {
        await fire(schedule, scheduleNote(schedule, due, status === "late"));
      } catch (error) {
        console.warn(`Schedule ${schedule.id} could not wake its bot:`, describeError(error));
        status = "failed";
      }
    }
    const ran = status === "started" || status === "late";
    await db
      .update(botSchedules)
      .set(ran ? { lastStatus: status, lastRunAt: now } : { lastStatus: status })
      .where(eq(botSchedules.id, schedule.id));
  }

  async function tick(now = clock()) {
    const due = await db
      .select()
      .from(botSchedules)
      .where(
        and(
          eq(botSchedules.enabled, true),
          isNotNull(botSchedules.nextRunAt),
          lte(botSchedules.nextRunAt, now),
        ),
      )
      .orderBy(asc(botSchedules.nextRunAt))
      .limit(TICK_LIMIT);
    for (const schedule of due) {
      await handle(schedule, now).catch((error: unknown) => {
        console.warn(`Schedule ${schedule.id} could not be run:`, describeError(error));
      });
    }
  }

  const guarded = () => {
    ticking ??= tick()
      .catch((error: unknown) => console.warn("A schedule tick failed:", describeError(error)))
      .finally(() => (ticking = undefined));
    return ticking;
  };

  return {
    tick,
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
