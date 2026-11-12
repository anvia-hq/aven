import { parseBotPrompt } from "./bots";

export const WEBHOOKS_LIMIT = 20;

export const WEBHOOK_NAME_MAX = 60;

export const WEBHOOK_TOKEN_PREFIX = "avnwh_";

export const WEBHOOK_BODY_MAX = 256 * 1024;

export const WEBHOOK_NOTE_PREFIX = "Webhook ";

export function isWebhookNote(prompt: string) {
  const { note, text } = parseBotPrompt(prompt);
  return note === true && text.startsWith(WEBHOOK_NOTE_PREFIX);
}
