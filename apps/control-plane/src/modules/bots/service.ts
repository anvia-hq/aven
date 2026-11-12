import { db } from "@aven/db/client";
import { bots } from "@aven/db/schema/bots";
import { providers } from "@aven/db/schema/providers";
import { BOT_LIMIT, botHandleOf, freeBotHandle, MAIN_BOT_HANDLE } from "@aven/protocol/bots";
import { and, count, desc, eq, sql } from "drizzle-orm";

import { UnprocessableError } from "../../errors";
import { resolveModel } from "../providers/resolve-model";
import { requireUsableRuntime } from "../runtimes/usable";
import type { UpdateBotBody } from "./schema";
import type { NewBot } from "./types";
import type { BotRow } from "@aven/db/schema/types";
import type { Bot } from "@aven/protocol/types";

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
  modelId: row.providerId ? row.modelId : null,
  reasoningEffort: row.providerId ? row.reasoningEffort : null,
  compactAfterTokens: row.compactAfterTokens,
  runtimeId: row.runtimeId,
  isMain: row.isMain,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const ownBot = (userId: string, id: string) => and(eq(bots.id, id), eq(bots.userId, userId));

export const botsService = {
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

  async getByHandle(userId: string, handle: string) {
    const [row] = await db
      .select()
      .from(bots)
      .where(and(eq(bots.userId, userId), eq(bots.handle, handle)));
    return row ? view(row) : null;
  },

  async update(userId: string, id: string, body: UpdateBotBody) {
    const [current] = await db.select().from(bots).where(ownBot(userId, id));

    if (!current) return null;

    const { providerId, modelId, reasoningEffort, runtimeId, ...details } = body;

    if (runtimeId) await requireUsableRuntime(userId, runtimeId);

    const touchesModel = [providerId, modelId, reasoningEffort].some(
      (value) => value !== undefined,
    );
    const model = touchesModel
      ? await checkedModel(userId, current, { providerId, modelId, reasoningEffort })
      : {};
    const changes = { ...details, ...model, runtimeId };

    if (Object.values(changes).every((value) => value === undefined)) return view(current);

    const [row] = await db.update(bots).set(changes).where(ownBot(userId, id)).returning();
    return row ? view(row) : null;
  },
};

async function checkedModel(userId: string, current: BotModel, change: ModelChange) {
  if (change.providerId) await requireOwnProvider(userId, change.providerId);

  const model = modelAfter(current, change);
  await requireEffortOf(userId, model);
  return model;
}

type BotModel = Pick<BotRow, "providerId" | "modelId" | "reasoningEffort">;
type ModelChange = Pick<UpdateBotBody, "providerId" | "modelId" | "reasoningEffort">;

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
