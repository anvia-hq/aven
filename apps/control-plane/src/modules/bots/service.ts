import { db } from "@aven/db/client";
import { bots, type BotRow } from "@aven/db/schema/bots";
import { providers } from "@aven/db/schema/providers";
import type { Bot } from "@aven/protocol/bots";
import { and, desc, eq } from "drizzle-orm";

import { UnprocessableError } from "../../errors";
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
  providerId: row.providerId,
  // A model is the provider's: with the provider gone, so is its model.
  modelId: row.providerId ? row.modelId : null,
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
    const { providerId, modelId, ...rest } = body;
    const changes: Partial<BotRow> = { ...rest };
    if (providerId !== undefined) {
      // Only one of the person's own providers, and a model belongs to the provider it was
      // chosen from: a new provider starts without one unless the same request names it.
      if (providerId) await requireOwnProvider(userId, providerId);
      changes.providerId = providerId;
      changes.modelId = providerId ? (modelId ?? null) : null;
    } else if (modelId !== undefined) {
      changes.modelId = modelId;
    }
    const [row] = await db.update(bots).set(changes).where(ownBot(userId, id)).returning();
    return row ? view(row) : null;
  },
};

async function requireOwnProvider(userId: string, providerId: string) {
  const [row] = await db
    .select({ id: providers.id })
    .from(providers)
    .where(and(eq(providers.id, providerId), eq(providers.userId, userId)));
  if (!row) throw new UnprocessableError("Provider not found");
}
