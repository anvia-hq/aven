import type { Webhook, WebhookCreated, WebhookStatus } from "@aven/protocol/types";

export type WebhookDelivery = {
  token: string;
  body: string;
  headers: Record<string, string>;
  receivedAt?: Date;
};

export type WebhookReceived = { id: string; status: WebhookStatus };

export type WebhookFire = (userId: string, botId: string, note: string) => Promise<void>;

export type Webhooks = {
  list(userId: string): Promise<Webhook[]>;
  create(userId: string, input: { name: string }): Promise<WebhookCreated>;
  setEnabled(userId: string, id: string, enabled: boolean): Promise<Webhook | null>;
  remove(userId: string, id: string): Promise<boolean>;
  receive(id: string, delivery: WebhookDelivery): Promise<WebhookReceived>;
};
