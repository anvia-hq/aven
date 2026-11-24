import { db } from "@aven/db/client";
import { automations } from "@aven/db/schema/automations";
import type { AutomationRow } from "@aven/db/schema/types";
import { nextRun } from "@aven/server-kit/cron";
import { describeError } from "@aven/server-kit/errors";
import { createPoller } from "@aven/server-kit/poller";
import { and, asc, eq, isNotNull, lte } from "drizzle-orm";

const TICK_LIMIT = 50;

export function createAutomationScheduler(options: {
  fireDue(id: string, now: Date): Promise<void>;
  intervalMs: number;
}) {
  const { fireDue, intervalMs } = options;

  async function handle(row: AutomationRow, now: Date) {
    if (!row.cron || !row.timezone || !row.nextRunAt) return;

    const next = nextRun(row.cron, row.timezone, now);
    const [claimed] = await db
      .update(automations)
      .set({ nextRunAt: next })
      .where(and(eq(automations.id, row.id), eq(automations.nextRunAt, row.nextRunAt)))
      .returning({ id: automations.id });

    if (!claimed) return;

    await fireDue(row.id, now);
  }

  async function tick(now = new Date()) {
    const due = await db
      .select()
      .from(automations)
      .where(
        and(
          eq(automations.enabled, true),
          eq(automations.triggerKind, "schedule"),
          isNotNull(automations.nextRunAt),
          lte(automations.nextRunAt, now),
        ),
      )
      .orderBy(asc(automations.nextRunAt))
      .limit(TICK_LIMIT);

    for (const row of due) {
      await handle(row, now).catch((error: unknown) => {
        console.warn(`Automation ${row.id} could not be run:`, describeError(error));
      });
    }
  }

  const poller = createPoller({
    intervalMs,
    run: tick,
    onError: (error) => console.warn("An automation schedule tick failed:", describeError(error)),
  });

  return { tick, start: poller.start, close: poller.close };
}
