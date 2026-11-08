import { shipRequestOf, wrapShipRequest } from "@aven/protocol/ship-request";

import type { AttachmentUpload, OutgoingMessage, PendingMessage } from "./types";
import type { ChatMessage, MessageAttachment, RunEvent } from "@aven/protocol/types";

function textOf(message: ChatMessage) {
  return message.parts.map((part) => (part.type === "text" ? part.text : "")).join("");
}

function uploadedSize(data: string) {
  let padding = 0;
  if (data.endsWith("==")) padding = 2;
  else if (data.endsWith("=")) padding = 1;
  return Math.floor((data.length * 3) / 4) - padding;
}
const PREVIEW_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

export const isLocalPreview = (image: string) => image.startsWith("data:");

function attachmentOf({ name, mediaType, data }: AttachmentUpload) {
  const attachment: MessageAttachment = {
    name,
    mediaType: mediaType ?? "application/octet-stream",
    size: uploadedSize(data),
  };
  if (mediaType && PREVIEW_TYPES.has(mediaType)) {
    attachment.image = `data:${mediaType};base64,${data}`;
  }
  return attachment;
}

export function pendingMessage(id: string, message: OutgoingMessage): PendingMessage {
  const user: ChatMessage = {
    id: `pending-${id}`,
    role: "user",
    parts: [{ type: "text", text: message.prompt }],
  };
  if (message.attachments.length > 0) user.attachments = message.attachments.map(attachmentOf);
  if (message.mentions.length > 0) user.mentions = message.mentions;
  return { id, message: user };
}

export function pendingShip(id: string): PendingMessage {
  return {
    id,
    message: {
      id: `pending-${id}`,
      role: "user",
      parts: [{ type: "text", text: wrapShipRequest("Ship this thread") }],
    },
  };
}

const isShipRequest = (message: ChatMessage) => shipRequestOf(textOf(message)) !== null;

const sameRequest = (pending: ChatMessage, sent: string) =>
  textOf(pending) === sent || (isShipRequest(pending) && shipRequestOf(sent) !== null);

export function withoutPending(pending: PendingMessage[], id: string): PendingMessage[] {
  return pending.filter((item) => item.id !== id);
}

export function settlePending(pending: PendingMessage[], event: RunEvent): PendingMessage[] {
  if (pending.length === 0) return pending;
  switch (event.type) {
    case "run_start": {
      const at = pending.findIndex(({ message }) => sameRequest(message, event.prompt));
      return at === -1 ? pending : pending.filter((_, index) => index !== at);
    }
    case "steer":
    case "steer_queued":
    case "steer_rejected":
      return withoutPending(pending, event.id);
    case "snapshot": {
      const sent = event.messages.filter((message) => message.role === "user").map(textOf);
      const recent = sent.slice(Math.max(0, sent.length - pending.length));
      return pending.filter(({ message }) => !recent.some((text) => sameRequest(message, text)));
    }
    default:
      return pending;
  }
}
