import { afterAll, describe, expect, test } from "bun:test";

import { db } from "@aven/db/client";
import { announcements } from "@aven/db/schema/announcements";
import { inArray } from "drizzle-orm";

import { announcementsService } from "./service";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("announcements (real postgres)", () => {
  const made: string[] = [];

  afterAll(async () => {
    await db.delete(announcements).where(inArray(announcements.id, made));
  });

  test("only one announcement stays active", async () => {
    const input = { title: "A", summary: "a", details: "", template: "waves" as const };
    const first = await announcementsService.create({ ...input, active: true });
    const second = await announcementsService.create({ ...input, title: "B", active: true });
    made.push(first.id, second.id);

    const rows = (await announcementsService.list()).filter((row) => made.includes(row.id));

    expect(rows.filter((row) => row.active).map((row) => row.id)).toEqual([second.id]);
    expect((await announcementsService.active())?.id).toBe(second.id);
  });
});
