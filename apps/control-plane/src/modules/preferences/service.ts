import { db } from "@aven/db/client";
import { userSettings } from "@aven/db/schema/user-settings";
import { eq, sql } from "drizzle-orm";

import { UnprocessableError } from "@aven/server-kit/errors";
import { serverSmallModel } from "../providers/server-small-model";
import { serverModelsService } from "../server-models/service";
import type { FollowUpSettings, FollowUpView, ServerSmallModelView } from "./types";
import { checkTimezone, CronError, systemTimezone } from "../schedules/cron";

serverSmallModel(process.env);

async function serverModelView(): Promise<ServerSmallModelView | null> {
  const { small } = await serverModelsService.view();
  return small ? { provider: small.kind, modelId: small.modelId } : null;
}

export const preferencesService = {
  async timezone(userId: string) {
    const [row] = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
    return row?.timezone ?? systemTimezone();
  },

  async get(userId: string) {
    const [row] = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
    return {
      timezone: row?.timezone ?? null,
      defaultTimezone: systemTimezone(),
      dismissedNotices: row?.dismissedNotices ?? [],
      followUps: {
        enabled: row?.followUpsEnabled ?? false,
        providerId: row?.followUpsProviderId ?? null,
        modelId: row?.followUpsModelId ?? null,
        serverModel: await serverModelView(),
      } satisfies FollowUpView,
    };
  },

  async followUps(userId: string) {
    return (await this.get(userId)).followUps;
  },

  async setFollowUps(userId: string, followUps: FollowUpSettings) {
    const values = {
      followUpsEnabled: followUps.enabled,
      followUpsProviderId: followUps.providerId,
      followUpsModelId: followUps.modelId,
    };
    await db
      .insert(userSettings)
      .values({ userId, ...values })
      .onConflictDoUpdate({ target: userSettings.userId, set: values });
    return { ...followUps, serverModel: await serverModelView() } satisfies FollowUpView;
  },

  async dismissNotice(userId: string, id: string) {
    await db
      .insert(userSettings)
      .values({ userId, dismissedNotices: [id] })
      .onConflictDoUpdate({
        target: userSettings.userId,
        set: {
          dismissedNotices: sql`(select coalesce(array_agg(distinct n), '{}') from unnest(${userSettings.dismissedNotices} || ${id}::text) as n)`,
        },
      });
    return { dismissed: id };
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
