import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { automations } from "./automations";
import { threads } from "./threads";

export const automationRuns = pgTable(
  "automation_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    automationId: uuid("automation_id")
      .notNull()
      .references(() => automations.id, { onDelete: "cascade" }),
    threadId: uuid("thread_id").references(() => threads.id, { onDelete: "set null" }),
    triggerSummary: text("trigger_summary").notNull(),
    status: text("status", { enum: ["running", "done", "failed"] }).notNull(),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    index("automation_runs_automation_created_idx").on(table.automationId, table.createdAt),
  ],
);
