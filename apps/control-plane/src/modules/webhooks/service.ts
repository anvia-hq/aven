import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { db } from "@aven/db/client";
import { botWebhooks } from "@aven/db/schema/bot-webhooks";
import { WEBHOOKS_LIMIT, WEBHOOK_TOKEN_PREFIX } from "@aven/protocol/webhooks";
import { and, asc, count, eq, sql } from "drizzle-orm";

import { ConflictError, NotFoundError, UnavailableError, UnprocessableError } from "../../errors";
import { botsService } from "../bots/service";
import { webhookNote } from "./note";
import type { CreateWebhookBody } from "./schema";
import type { WebhookDelivery, WebhookFire } from "./types";
import type { BotWebhookRow } from "@aven/db/schema/types";
import type { Webhook, WebhookCreated, WebhookStatus } from "@aven/protocol/types";

const STATUSES = new Set<string>(["delivered", "busy", "failed"]);

const hashOf = (token: string) => createHash("sha256").update(token).digest("hex");

function sameToken(token: string, stored: string) {
  const given = Buffer.from(hashOf(token), "hex");
  const kept = Buffer.from(stored, "hex");
  return given.length === kept.length && timingSafeEqual(given, kept);
}

const statusOf = (stored: string | null): WebhookStatus | null =>
  stored && STATUSES.has(stored) ? (stored as WebhookStatus) : null;

const view = (row: BotWebhookRow): Webhook => ({
  id: row.id,
  name: row.name,
  hint: row.tokenHint,
  path: `/webhooks/${row.id}`,
  enabled: row.enabled,
  lastDeliveryAt: row.lastDeliveryAt?.toISOString() ?? null,
  lastStatus: statusOf(row.lastStatus),
  createdAt: row.createdAt.toISOString(),
});

const ownWebhook = (userId: string, id: string) =>
  and(eq(botWebhooks.userId, userId), eq(botWebhooks.id, id));

async function mainBotOf(userId: string) {
  const main = (await botsService.list(userId)).find((bot) => bot.isMain);

  if (!main) throw new UnavailableError("The person has no main bot");

  return main;
}

export function createWebhooks({ fire }: { fire: WebhookFire }) {
  return {
    async list(userId: string) {
      const rows = await db
        .select()
        .from(botWebhooks)
        .where(eq(botWebhooks.userId, userId))
        .orderBy(asc(botWebhooks.createdAt));
      return rows.map(view);
    },

    async create(userId: string, { name }: CreateWebhookBody): Promise<WebhookCreated> {
      const token = `${WEBHOOK_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
      const row = await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`webhooks:${userId}`}))`);
        const [owned] = await tx
          .select({ total: count() })
          .from(botWebhooks)
          .where(eq(botWebhooks.userId, userId));

        if ((owned?.total ?? 0) >= WEBHOOKS_LIMIT) {
          throw new UnprocessableError(`You can have at most ${WEBHOOKS_LIMIT} webhooks`);
        }

        const [made] = await tx
          .insert(botWebhooks)
          .values({
            userId,
            name,
            tokenHash: hashOf(token),
            tokenHint: token.slice(-4),
          })
          .returning();
        return made!;
      });
      const shown = view(row);
      return { ...shown, token, urlPath: `${shown.path}/${token}` };
    },

    async setEnabled(userId: string, id: string, enabled: boolean) {
      const [row] = await db
        .update(botWebhooks)
        .set({ enabled })
        .where(ownWebhook(userId, id))
        .returning();
      return row ? view(row) : null;
    },

    async remove(userId: string, id: string) {
      const removed = await db
        .delete(botWebhooks)
        .where(ownWebhook(userId, id))
        .returning({ id: botWebhooks.id });
      return removed.length > 0;
    },

    async receive(id: string, { token, body, headers, receivedAt = new Date() }: WebhookDelivery) {
      const [row] = await db.select().from(botWebhooks).where(eq(botWebhooks.id, id));

      if (!row || !sameToken(token, row.tokenHash)) throw new NotFoundError("Webhook not found");

      if (!row.enabled) throw new UnprocessableError("This webhook is turned off");

      const main = await mainBotOf(row.userId);
      const note = webhookNote(row, { body, headers, receivedAt });
      let status: WebhookStatus = "delivered";
      try {
        await fire(row.userId, main.id, note);
      } catch (error) {
        status = error instanceof ConflictError ? "busy" : "failed";
        throw error;
      } finally {
        await db
          .update(botWebhooks)
          .set({ lastDeliveryAt: receivedAt, lastStatus: status })
          .where(eq(botWebhooks.id, row.id))
          .catch((error: unknown) => {
            console.warn(`Could not record the delivery of webhook ${row.id}:`, error);
          });
      }

      return { id: row.id, status };
    },
  };
}
