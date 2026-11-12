import { WEBHOOK_NAME_MAX } from "@aven/protocol/webhooks";
import { z } from "zod";

export const webhookParams = z.object({ id: z.uuid() });

export const webhookDeliveryParams = webhookParams.extend({
  token: z.string().min(1).max(200),
});

export const createWebhookBody = z.object({
  name: z.string().trim().min(1).max(WEBHOOK_NAME_MAX),
});

export const updateWebhookBody = z.object({ enabled: z.boolean() });

export type CreateWebhookBody = z.infer<typeof createWebhookBody>;

export type UpdateWebhookBody = z.infer<typeof updateWebhookBody>;
