import { afterAll, describe, expect, test } from "bun:test";

import { db } from "@aven/db/client";
import { announcements } from "@aven/db/schema/announcements";
import { eq, inArray } from "drizzle-orm";

import { announcementsService } from "./service";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("announcements (real postgres)", async () => {
  const made: string[] = [];
  const wasActive = await announcementsService.active();

  afterAll(async () => {
    await db.delete(announcements).where(inArray(announcements.id, made));

    if (wasActive) {
      await db
        .update(announcements)
        .set({ active: true })
        .where(eq(announcements.id, wasActive.id));
    }
  });

  test("only one announcement stays active", async () => {
    const input = { title: "A", summary: "a", details: "", template: "waves" as const };
    const first = await announcementsService.create({ ...input, active: true });
    const second = await announcementsService.create({ ...input, title: "B", active: true });
    made.push(first.id, second.id);

    const rows = (await announcementsService.list()).filter((row) => made.includes(row.id));

    expect(rows.flatMap((row) => (row.active ? [row.id] : []))).toEqual([second.id]);
    expect((await announcementsService.active())?.id).toBe(second.id);
  });

  test("publishing at the same time still leaves one active", async () => {
    const input = {
      title: "C",
      summary: "c",
      details: "",
      template: "waves" as const,
      active: true,
    };
    const results = await Promise.allSettled([
      announcementsService.create(input),
      announcementsService.create({ ...input, title: "D" }),
    ]);
    for (const result of results) if (result.status === "fulfilled") made.push(result.value.id);

    const live = (await announcementsService.list()).filter((row) => row.active);

    expect(live).toHaveLength(1);
  });
});
