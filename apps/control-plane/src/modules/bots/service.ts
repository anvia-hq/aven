import { db } from "@aven/db/client";
import { botGoals } from "@aven/db/schema/bot-goals";
import { botSchedules } from "@aven/db/schema/bot-schedules";
import { bots } from "@aven/db/schema/bots";
import { providers } from "@aven/db/schema/providers";
import { BOT_LIMIT, botHandleOf, freeBotHandle, MAIN_BOT_HANDLE } from "@aven/protocol/bots";
import { and, count, desc, eq, inArray, max, sql } from "drizzle-orm";

import { UnprocessableError } from "@aven/server-kit/errors";
import { assertBotModel } from "../providers/bot-run-choice";
import { requireUsableRuntime } from "../runtimes/usable";
import type { UpdateBotBody } from "./schema";
import type { NewBot } from "./types";
import type { BotRow } from "@aven/db/schema/types";
import type { Bot, BotAttention } from "@aven/protocol/types";

const MAIN_BOT = {
  name: "Aven",
  instruction:
    "You are a warm, curious companion. Talk the way a friend texts: short, natural messages, one thought at a time.",
  avatar: "",
  hasComputer: false,
} as const;

const view = (row: BotRow, attention: BotAttention | null): Bot => ({
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
  hasComputer: row.hasComputer,
  runtimeId: row.runtimeId,
  isMain: row.isMain,
  attention,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const ownBot = (userId: string, id: string) => and(eq(bots.id, id), eq(bots.userId, userId));

const attentionOf = (
  row: BotRow,
  goalSince?: Date | null,
  scheduleSince?: Date | null,
): BotAttention | null => {
  if (row.questionAskedAt) return { reason: "question", since: row.questionAskedAt.toISOString() };

  if (goalSince) return { reason: "goal", since: goalSince.toISOString() };

  if (scheduleSince) return { reason: "schedule", since: scheduleSince.toISOString() };

  if (row.lastSaidAt && (!row.lastReadAt || row.lastReadAt < row.lastSaidAt))
    return { reason: "message", since: row.lastSaidAt.toISOString() };

  return null;
};

export const botsService = {
  async makeMain(userId: string) {
    const [made] = await db
      .insert(bots)
      .values({ userId, isMain: true, handle: MAIN_BOT_HANDLE, ...MAIN_BOT })
      .onConflictDoNothing()
      .returning();
    return made ? view(made, null) : null;
  },

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
    const ids = rows.map((row) => row.id);
    const blocked = ids.length
      ? await db
          .select({ botId: botGoals.botId, since: max(botGoals.updatedAt) })
          .from(botGoals)
          .where(
            and(
              eq(botGoals.userId, userId),
              eq(botGoals.phase, "blocked"),
              inArray(botGoals.botId, ids),
            ),
          )
          .groupBy(botGoals.botId)
      : [];
    const failing = ids.length
      ? await db
          .select({ botId: botSchedules.botId, since: max(botSchedules.updatedAt) })
          .from(botSchedules)
          .where(
            and(
              eq(botSchedules.userId, userId),
              eq(botSchedules.enabled, true),
              inArray(botSchedules.lastStatus, ["failed", "missed"]),
              inArray(botSchedules.botId, ids),
            ),
          )
          .groupBy(botSchedules.botId)
      : [];
    const blockedAt = new Map(blocked.map((each) => [each.botId, each.since]));
    const failedAt = new Map(failing.map((each) => [each.botId, each.since]));

    return rows.map((row) =>
      view(row, attentionOf(row, blockedAt.get(row.id), failedAt.get(row.id))),
    );
  },

  async markSaid(botId: string, askedQuestion: boolean) {
    const now = new Date();
    await db
      .update(bots)
      .set(askedQuestion ? { lastSaidAt: now, questionAskedAt: now } : { lastSaidAt: now })
      .where(eq(bots.id, botId));
  },

  async markRead(userId: string, id: string) {
    const [row] = await db
      .update(bots)
      .set({ lastReadAt: new Date() })
      .where(ownBot(userId, id))
      .returning({ id: bots.id });
    return row?.id ?? null;
  },

  async answerQuestion(botId: string) {
    await db.update(bots).set({ questionAskedAt: null }).where(eq(bots.id, botId));
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
        .values({ userId, name, handle, instruction, description, hasComputer: false })
        .returning();
      return view(row!, null);
    });
  },

  async get(userId: string, id: string) {
    const [row] = await db.select().from(bots).where(ownBot(userId, id));
    return row ? view(row, null) : null;
  },

  async getByHandle(userId: string, handle: string) {
    const [row] = await db
      .select()
      .from(bots)
      .where(and(eq(bots.userId, userId), eq(bots.handle, handle)));
    return row ? view(row, null) : null;
  },

  async remove(userId: string, id: string) {
    const [row] = await db
      .delete(bots)
      .where(and(ownBot(userId, id), eq(bots.isMain, false)))
      .returning();
    return row ? view(row, null) : null;
  },

  async update(userId: string, id: string, body: UpdateBotBody) {
    const [current] = await db.select().from(bots).where(ownBot(userId, id));

    if (!current) return null;

    const { providerId, modelId, reasoningEffort, runtimeId, hasComputer, ...details } = body;

    if (runtimeId) await requireUsableRuntime(userId, runtimeId);

    const computer: { hasComputer?: boolean; runtimeId?: string | null } = {};

    if (hasComputer === true) computer.hasComputer = true;

    if (hasComputer === false) {
      computer.hasComputer = false;
      computer.runtimeId = null;
    }

    const touchesModel = [providerId, modelId, reasoningEffort].some(
      (value) => value !== undefined,
    );
    const model = touchesModel
      ? await checkedModel(userId, current, { providerId, modelId, reasoningEffort })
      : {};
    const changes = { ...details, ...model, ...computer };

    if (runtimeId !== undefined && hasComputer !== false) changes.runtimeId = runtimeId;

    if (Object.values(changes).every((value) => value === undefined)) return view(current, null);

    const [row] = await db.update(bots).set(changes).where(ownBot(userId, id)).returning();
    return row ? view(row, null) : null;
  },
};

async function checkedModel(userId: string, current: BotModel, change: ModelChange) {
  if (change.providerId) await requireOwnProvider(userId, change.providerId);

  const model = modelAfter(current, change);
  await assertBotModel(userId, model);
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

async function requireOwnProvider(userId: string, providerId: string) {
  const [row] = await db
    .select({ id: providers.id })
    .from(providers)
    .where(and(eq(providers.id, providerId), eq(providers.userId, userId)));

  if (!row) throw new UnprocessableError("Provider not found");
}
