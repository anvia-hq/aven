import { describe, expect, test } from "bun:test";

import { botNote, personPrompt } from "./bots";
import { isWebhookNote, WEBHOOK_NOTE_PREFIX } from "./webhooks";

describe("isWebhookNote", () => {
  test("tells a webhook's note from the person's own words and from other notes", () => {
    expect(isWebhookNote(botNote(`${WEBHOOK_NOTE_PREFIX}"Issues" arrived.`))).toBe(true);
    expect(isWebhookNote(personPrompt("Webhook issues arrived"))).toBe(false);
    expect(isWebhookNote(personPrompt(botNote("Webhook issues arrived")))).toBe(false);
    expect(isWebhookNote(botNote("Scheduled task is due"))).toBe(false);
    expect(isWebhookNote(botNote("Goal round 1 of 20."))).toBe(false);
    expect(isWebhookNote("Webhook issues arrived")).toBe(false);
  });
});
