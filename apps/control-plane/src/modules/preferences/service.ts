import { db } from "@aven/db/client";
import { userSettings } from "@aven/db/schema/user-settings";
import { eq } from "drizzle-orm";

import { UnprocessableError } from "../../errors";
import { checkTimezone, CronError, systemTimezone } from "../schedules/cron";

export const preferencesService = {
  async timezone(userId: string) {
    const [row] = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
    return row?.timezone ?? systemTimezone();
  },

  async get(userId: string) {
    const [row] = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
    return { timezone: row?.timezone ?? null, defaultTimezone: systemTimezone() };
  },

  async setDefaultTimezone(userId: string, timezone: string) {
    this.check(timezone);
    await db.insert(userSettings).values({ userId, timezone }).onConflictDoNothing();
    return { timezone: await this.timezone(userId) };
  },

  check(timezone: string) {
    try {
      checkTimezone(timezone);
    } catch (error) {
      if (error instanceof CronError) throw new UnprocessableError(error.message);
      throw error;
    }
  },

  async setTimezone(userId: string, timezone: string) {
    this.check(timezone);
    await db
      .insert(userSettings)
      .values({ userId, timezone })
      .onConflictDoUpdate({ target: userSettings.userId, set: { timezone } });
    return { timezone };
  },
};
