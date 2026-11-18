import { attachmentPreview } from "@/modules/threads/pending-messages";
import type { AttachmentUpload, Handoff } from "@/modules/threads/types";
import type {
  BotChatMessage,
  BotChatQuote,
  BotEvent,
  MessageAttachment,
} from "@aven/protocol/types";

import type { PendingBotMessage } from "./types";

export function newPendingId() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  );
}

export function pendingMessage(
  id: string,
  text: string,
  files: readonly AttachmentUpload[] = [],
  quote?: BotChatQuote,
): PendingBotMessage {
  const message: BotChatMessage = { id: `pending-${id}`, role: "user", text };

  if (files.length > 0) message.attachments = files.map(attachmentPreview);

  if (quote) message.quote = quote;

  return { id, message };
}

const namesOf = (attachments: readonly MessageAttachment[] = []) =>
  attachments.map(({ name }) => name).join("\u0000");

const sameSent = (pending: BotChatMessage, sent: BotChatMessage) =>
  pending.text === sent.text && namesOf(pending.attachments) === namesOf(sent.attachments);

export function handoffOf(pending: readonly PendingBotMessage[], event: BotEvent): Handoff | null {
  if (event.type !== "message" || event.message.role !== "user") return null;

  const shown = pending.find(({ message }) => sameSent(message, event.message));

  return shown ? { key: shown.message.id, previews: shown.message.attachments } : null;
}

export function settlePending(pending: PendingBotMessage[], event: BotEvent): PendingBotMessage[] {
  if (pending.length === 0) return pending;

  if (event.type === "message") {
    if (event.message.role !== "user") return pending;

    const at = pending.findIndex(({ message }) => sameSent(message, event.message));
    return at === -1 ? pending : pending.filter((_, index) => index !== at);
  }

  if (event.type === "snapshot") {
    const sent = event.messages.filter(({ role }) => role === "user");
    const recent = sent.slice(Math.max(0, sent.length - pending.length));
    return pending.filter(({ message }) => !recent.some((each) => sameSent(message, each)));
  }

  return pending;
}
