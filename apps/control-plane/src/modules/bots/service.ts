import { db } from "@aven/db/client";
import { bots, type BotRow } from "@aven/db/schema/bots";
import { providers } from "@aven/db/schema/providers";
import type { Bot } from "@aven/protocol/bots";
import { and, desc, eq } from "drizzle-orm";

import { UnprocessableError } from "../../errors";
import { resolveModel } from "../providers/resolve-model";
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
  reasoningEffort: row.providerId ? row.reasoningEffort : null,
  compactAfterTokens: row.compactAfterTokens,
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
    const [current] = await db.select().from(bots).where(ownBot(userId, id));
    if (!current) return null;

    const { providerId, modelId, reasoningEffort, ...rest } = body;
    const changes: Partial<BotRow> = { ...rest };
    const providerAfter = providerId === undefined ? current.providerId : providerId;
    // Only one of the person's own providers.
    if (providerId) await requireOwnProvider(userId, providerId);

    if (!providerAfter) {
      // A bot on the default has no model or effort of its own to keep.
      changes.providerId = null;
      changes.modelId = null;
      changes.reasoningEffort = null;
    } else {
      changes.providerId = providerAfter;
      // A model, and its effort, belong to the provider they were chosen from: a changed one
      // starts without them unless the same request names them.
      const changed = providerId !== undefined || modelId !== undefined;
      changes.modelId = changed ? null : current.modelId;
      changes.reasoningEffort = changed ? null : current.reasoningEffort;
      if (modelId !== undefined) changes.modelId = modelId;
      if (reasoningEffort !== undefined) changes.reasoningEffort = reasoningEffort;
      if (changes.reasoningEffort) {
        // Refused here, in words, if the model does not take it; not when the bot next speaks.
        await resolveModel(userId, {
          providerId: providerAfter,
          modelId: changes.modelId ?? undefined,
          reasoningEffort: changes.reasoningEffort,
        });
      }
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
