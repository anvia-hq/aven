import { db } from "@aven/db/client";
import { sessions } from "@aven/db/schema/sessions";
import { users } from "@aven/db/schema/users";
import { count, gt } from "drizzle-orm";

import type { DashboardStats } from "./schema";

const DAY_MS = 24 * 60 * 60 * 1000;

export const dashboardService = {
  stats: async (): Promise<DashboardStats> => {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * DAY_MS);

    const [[total], [active], [recent]] = await Promise.all([
      db.select({ value: count() }).from(users),
      db.select({ value: count() }).from(sessions).where(gt(sessions.expiresAt, now)),
      db.select({ value: count() }).from(users).where(gt(users.createdAt, weekAgo)),
    ]);

    return {
      users: total?.value ?? 0,
      activeSessions: active?.value ?? 0,
      signupsLast7Days: recent?.value ?? 0,
    };
  },
};
