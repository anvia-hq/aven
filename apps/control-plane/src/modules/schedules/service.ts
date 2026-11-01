import { db } from "@aven/db/client";
import { botSchedules, type BotScheduleRow } from "@aven/db/schema/bot-schedules";
import { bots } from "@aven/db/schema/bots";
import {
  SCHEDULE_MIN_INTERVAL_MS,
  SCHEDULES_LIMIT,
  type BotScheduleView,
  type ScheduleStatus,
} from "@aven/protocol/schedules";
import { and, asc, count, eq, sql } from "drizzle-orm";

import { NotFoundError, UnprocessableError } from "../../errors";
import { botsService } from "../bots/service";
import { preferencesService } from "../preferences/service";
import { checkTimezone, CronError, describeTime, nextRun } from "./cron";

export type ScheduleInput = {
  name: string;
  cron: string;
  prompt: string;
  timezone?: string;
  /** The handle of the bot that runs it. */
  bot?: string;
};

export type SchedulePatch = Partial<ScheduleInput & { enabled: boolean }>;

// The next three times it runs must be a quarter of an hour or more apart, and there must be some.
function checkExpression(cron: string, timezone: string, now: Date) {
  try {
    checkTimezone(timezone);
    const times: Date[] = [];
    for (let after = now; times.length < 3;) {
      const next = nextRun(cron, timezone, after);
      if (!next) break;
      times.push(next);
      after = next;
    }
    if (times.length === 0) throw new UnprocessableError("That schedule never runs.");
    for (let index = 1; index < times.length; index++) {
      if (times[index]!.getTime() - times[index - 1]!.getTime() < SCHEDULE_MIN_INTERVAL_MS) {
        throw new UnprocessableError("Schedules can run at most once every 15 minutes.");
      }
    }
  } catch (error) {
    if (error instanceof CronError) throw new UnprocessableError(error.message);
    throw error;
  }
}

const ownSchedule = (userId: string, id: string) =>
  and(eq(botSchedules.userId, userId), eq(botSchedules.id, id));

async function view(row: BotScheduleRow): Promise<BotScheduleView> {
  const [bot] = await db.select({ handle: bots.handle }).from(bots).where(eq(bots.id, row.botId));
  const time = (date: Date | null) =>
    date ? `${date.toISOString()} (${describeTime(date, row.timezone)})` : null;
  return {
    id: row.id,
    bot: bot?.handle ?? "unknown",
    name: row.name,
    cron: row.cron,
    timezone: row.timezone,
    prompt: row.prompt,
    enabled: row.enabled,
    nextRun: time(row.nextRunAt),
    lastRun: time(row.lastRunAt),
    lastStatus: row.lastStatus as ScheduleStatus | null,
  };
}

// The bot a handle names among the person's.
async function botNamed(userId: string, handle: string) {
  const bot = await botsService.getByHandle(userId, handle.trim().replace(/^@/, "").toLowerCase());
  if (!bot) throw new UnprocessableError(`No bot with the handle "${handle}". Use list_bots.`);
  return bot.id;
}

export const schedulesService = {
  async list(userId: string) {
    const rows = await db
      .select()
      .from(botSchedules)
      .where(eq(botSchedules.userId, userId))
      .orderBy(asc(botSchedules.createdAt));
    return Promise.all(rows.map(view));
  },

  // At most SCHEDULES_LIMIT a person; one at a time, or schedules made at once would each see room.
  async create(userId: string, selfId: string, input: ScheduleInput, now = new Date()) {
    const botId = input.bot === undefined ? selfId : await botNamed(userId, input.bot);
    const timezone = input.timezone ?? (await preferencesService.timezone(userId));
    checkExpression(input.cron, timezone, now);
    const row = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`schedules:${userId}`}))`);
      const [owned] = await tx
        .select({ total: count() })
        .from(botSchedules)
        .where(eq(botSchedules.userId, userId));
      if ((owned?.total ?? 0) >= SCHEDULES_LIMIT) {
        throw new UnprocessableError(`There can be at most ${SCHEDULES_LIMIT} schedules.`);
      }
      const [made] = await tx
        .insert(botSchedules)
        .values({
          userId,
          botId,
          name: input.name,
          cron: input.cron,
          timezone,
          prompt: input.prompt,
          nextRunAt: nextRun(input.cron, timezone, now),
        })
        .returning();
      return made!;
    });
    return view(row);
  },

  async update(userId: string, id: string, patch: SchedulePatch, now = new Date()) {
    const [current] = await db.select().from(botSchedules).where(ownSchedule(userId, id));
    if (!current) throw new NotFoundError("Schedule not found.");
    // What is left out stays: an undefined is not a change.
    const { bot, ...given } = patch;
    const fields = Object.fromEntries(
      Object.entries(given).filter(([, value]) => value !== undefined),
    );
    const next = { ...current, ...fields };
    // What changes when it runs is found again: from now, and not at all while it is paused.
    const timing =
      fields.cron !== undefined || fields.timezone !== undefined || fields.enabled === true;
    if (timing) checkExpression(next.cron, next.timezone, now);
    const changes: Partial<typeof botSchedules.$inferInsert> = { ...fields };
    if (bot !== undefined) changes.botId = await botNamed(userId, bot);
    if (timing) changes.nextRunAt = next.enabled ? nextRun(next.cron, next.timezone, now) : null;
    if (fields.enabled === false) changes.nextRunAt = null;
    const [row] = await db
      .update(botSchedules)
      .set(changes)
      .where(ownSchedule(userId, id))
      .returning();
    return view(row!);
  },

  async remove(userId: string, id: string) {
    const deleted = await db
      .delete(botSchedules)
      .where(ownSchedule(userId, id))
      .returning({ id: botSchedules.id });
    if (deleted.length === 0) throw new NotFoundError("Schedule not found.");
  },
};
