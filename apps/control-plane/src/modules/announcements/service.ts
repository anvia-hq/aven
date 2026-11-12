import { db } from "@aven/db/client";
import { announcements } from "@aven/db/schema/announcements";
import { desc, eq, ne } from "drizzle-orm";
import type { z } from "zod";

import { NotFoundError } from "../../errors";
import type { createAnnouncementBody, updateAnnouncementBody } from "./schema";

type Create = z.infer<typeof createAnnouncementBody>;
type Update = z.infer<typeof updateAnnouncementBody>;

async function deactivateOthers(id: string) {
  await db.update(announcements).set({ active: false }).where(ne(announcements.id, id));
}

export const announcementsService = {
  async active() {
    const [row] = await db
      .select()
      .from(announcements)
      .where(eq(announcements.active, true))
      .orderBy(desc(announcements.updatedAt))
      .limit(1);
    return row ?? null;
  },

  list() {
    return db.select().from(announcements).orderBy(desc(announcements.createdAt));
  },

  async create(input: Create) {
    const [row] = await db.insert(announcements).values(input).returning();

    if (!row) throw new Error("Announcement was not saved");

    if (row.active) await deactivateOthers(row.id);

    return row;
  },

  async update(id: string, input: Update) {
    const [row] = await db
      .update(announcements)
      .set(input)
      .where(eq(announcements.id, id))
      .returning();

    if (!row) throw new NotFoundError("Announcement not found");

    if (row.active) await deactivateOthers(row.id);

    return row;
  },

  async remove(id: string) {
    const removed = await db
      .delete(announcements)
      .where(eq(announcements.id, id))
      .returning({ id: announcements.id });

    if (removed.length === 0) throw new NotFoundError("Announcement not found");
  },
};
