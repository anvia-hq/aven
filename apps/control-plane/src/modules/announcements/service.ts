import { db } from "@aven/db/client";
import { announcements } from "@aven/db/schema/announcements";
import { and, desc, eq, ne } from "drizzle-orm";
import type { z } from "zod";

import { NotFoundError } from "../../errors";
import type { createAnnouncementBody, updateAnnouncementBody } from "./schema";

type Create = z.infer<typeof createAnnouncementBody>;
type Update = z.infer<typeof updateAnnouncementBody>;

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function deactivateOthers(tx: Transaction, id?: string) {
  await tx
    .update(announcements)
    .set({ active: false })
    .where(
      id
        ? and(eq(announcements.active, true), ne(announcements.id, id))
        : eq(announcements.active, true),
    );
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

  create(input: Create) {
    return db.transaction(async (tx) => {
      if (input.active) await deactivateOthers(tx);

      const [row] = await tx.insert(announcements).values(input).returning();

      if (!row) throw new Error("Announcement was not saved");

      return row;
    });
  },

  update(id: string, input: Update) {
    return db.transaction(async (tx) => {
      if (input.active) await deactivateOthers(tx, id);

      const [row] = await tx
        .update(announcements)
        .set(input)
        .where(eq(announcements.id, id))
        .returning();

      if (!row) throw new NotFoundError("Announcement not found");

      return row;
    });
  },

  async remove(id: string) {
    const removed = await db
      .delete(announcements)
      .where(eq(announcements.id, id))
      .returning({ id: announcements.id });

    if (removed.length === 0) throw new NotFoundError("Announcement not found");
  },
};
