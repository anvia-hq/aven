import { db } from "@aven/db/client";
import { bots, type BotRow } from "@aven/db/schema/bots";
import type { Bot } from "@aven/protocol/bots";
import { and, desc, eq } from "drizzle-orm";

import type { UpdateBotBody } from "./schema";

// The main bot a person starts with, until they change it.
const MAIN_BOT = {
  name: "Aven",
  instruction:
    "You are a warm, curious companion. Talk the way a friend texts: short, natural messages, one thought at a time.",
  avatar: "",
} as const;

const view = (row: BotRow): Bot => ({
  id: row.id,
  name: row.name,
  instruction: row.instruction,
  avatar: row.avatar,
  isMain: row.isMain,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const ownBot = (userId: string, id: string) => and(eq(bots.id, id), eq(bots.userId, userId));

export const botsService = {
  // A person always has their main bot: it is made the first time they ask. Two requests at once
  // make one, since the partial unique index refuses the second.
  async list(userId: string) {
    await db
      .insert(bots)
      .values({ userId, isMain: true, ...MAIN_BOT })
      .onConflictDoNothing();
    const rows = await db
      .select()
      .from(bots)
      .where(eq(bots.userId, userId))
      .orderBy(desc(bots.isMain), bots.createdAt);
    return rows.map(view);
  },

  async get(userId: string, id: string) {
    const [row] = await db.select().from(bots).where(ownBot(userId, id));
    return row ? view(row) : null;
  },

  async update(userId: string, id: string, body: UpdateBotBody) {
    const [row] = await db.update(bots).set(body).where(ownBot(userId, id)).returning();
    return row ? view(row) : null;
  },
};
