import { db } from "@aven/db/client";
import { bots, type BotRow } from "@aven/db/schema/bots";
import { providers } from "@aven/db/schema/providers";
import {
  BOT_LIMIT,
  botHandleOf,
  freeBotHandle,
  MAIN_BOT_HANDLE,
  type Bot,
} from "@aven/protocol/bots";
import type { BotCreateParams } from "@aven/protocol/runtime-wire";
import { and, count, desc, eq, sql } from "drizzle-orm";

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
  handle: row.handle,
  instruction: row.instruction,
  description: row.description,
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

/**
 * What a new bot is: a name, what it is told to be like, and what it is for if that is said. It has
 * no avatar: its id draws one until the person picks one (decision 0062).
 */
export type NewBot = Omit<BotCreateParams, "replyId">;

const ownBot = (userId: string, id: string) => and(eq(bots.id, id), eq(bots.userId, userId));

export const botsService = {
  // A person always has their main bot: it is made the first time they ask. Two requests at once
  // make one, since the partial unique index refuses the second.
  async list(userId: string) {
    await db
      .insert(bots)
      .values({ userId, isMain: true, handle: MAIN_BOT_HANDLE, ...MAIN_BOT })
      .onConflictDoNothing();
    const rows = await db
      .select()
      .from(bots)
      .where(eq(bots.userId, userId))
      .orderBy(desc(bots.isMain), bots.createdAt);
    return rows.map(view);
  },

  // A bot made for the person, which answers with their default model until they pick another. A
  // person has at most BOT_LIMIT, so a bot that makes bots cannot fill the account (decision 0060);
  // the lock makes calls made at once count one after another, or each would see room for one more.
  async create(userId: string, { name, instruction, description = "" }: NewBot) {
    return db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`bots:${userId}`}))`);
      const [owned] = await tx.select({ total: count() }).from(bots).where(eq(bots.userId, userId));
      if ((owned?.total ?? 0) >= BOT_LIMIT) {
        throw new UnprocessableError(`You already have ${BOT_LIMIT} bots`);
      }
      const handles = await tx
        .select({ handle: bots.handle })
        .from(bots)
        .where(eq(bots.userId, userId));
      const handle = freeBotHandle(botHandleOf(name), new Set(handles.map((each) => each.handle)));
      const [row] = await tx
        .insert(bots)
        .values({ userId, name, handle, instruction, description })
        .returning();
      return view(row!);
    });
  },

  async get(userId: string, id: string) {
    const [row] = await db.select().from(bots).where(ownBot(userId, id));
    return row ? view(row) : null;
  },

  async update(userId: string, id: string, body: UpdateBotBody) {
    const [current] = await db.select().from(bots).where(ownBot(userId, id));
    if (!current) return null;

    const { providerId, modelId, reasoningEffort, ...details } = body;
    // A change that is not about the model leaves it alone: the catalog is not asked about a model
    // nobody touched, and a model chosen at the same moment is not written over.
    const touchesModel = [providerId, modelId, reasoningEffort].some(
      (value) => value !== undefined,
    );
    const model = touchesModel
      ? await checkedModel(userId, current, { providerId, modelId, reasoningEffort })
      : {};
    const changes = { ...details, ...model };
    if (Object.values(changes).every((value) => value === undefined)) return view(current);

    const [row] = await db.update(bots).set(changes).where(ownBot(userId, id)).returning();
    return row ? view(row) : null;
  },
};

// The model a change leads to, once its provider is the person's and its effort the model's.
async function checkedModel(userId: string, current: BotModel, change: ModelChange) {
  if (change.providerId) await requireOwnProvider(userId, change.providerId);
  const model = modelAfter(current, change);
  await requireEffortOf(userId, model);
  return model;
}

type BotModel = Pick<BotRow, "providerId" | "modelId" | "reasoningEffort">;
type ModelChange = Pick<UpdateBotBody, "providerId" | "modelId" | "reasoningEffort">;

// What the bot's model is after a change, and what was left out of it stays. A bot on the default
// has no model or effort of its own. A model, and its effort, belong to the provider they were
// chosen from: a changed one starts without them unless the same change names them.
function modelAfter(current: BotModel, change: ModelChange): BotModel {
  const providerId = change.providerId === undefined ? current.providerId : change.providerId;
  if (!providerId) return { providerId: null, modelId: null, reasoningEffort: null };
  const changed = change.providerId !== undefined || change.modelId !== undefined;
  const kept = changed ? { modelId: null, reasoningEffort: null } : current;
  return {
    providerId,
    modelId: change.modelId === undefined ? kept.modelId : change.modelId,
    reasoningEffort:
      change.reasoningEffort === undefined ? kept.reasoningEffort : change.reasoningEffort,
  };
}

// An effort the model does not take is refused here, in words, not when the bot next speaks.
async function requireEffortOf(userId: string, model: BotModel) {
  if (!model.providerId || !model.reasoningEffort) return;
  await resolveModel(userId, {
    providerId: model.providerId,
    modelId: model.modelId ?? undefined,
    reasoningEffort: model.reasoningEffort,
  });
}

async function requireOwnProvider(userId: string, providerId: string) {
  const [row] = await db
    .select({ id: providers.id })
    .from(providers)
    .where(and(eq(providers.id, providerId), eq(providers.userId, userId)));
  if (!row) throw new UnprocessableError("Provider not found");
}
