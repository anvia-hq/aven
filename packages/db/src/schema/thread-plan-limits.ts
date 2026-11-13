import { bigint, pgTable, primaryKey, real, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { threads } from "./threads";

export const threadPlanLimits = pgTable(
  "thread_plan_limits",
  {
    threadId: uuid("thread_id")
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    window: text("window").notNull(),
    status: text("status").notNull(),
    percent: real("percent").notNull(),
    resetsAt: bigint("resets_at", { mode: "number" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.threadId, table.window] })],
);
