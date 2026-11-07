import type { ChatMessage, RunEvent } from "@aven/protocol/events";

import type { AttachmentUpload, OutgoingMessage, PendingMessage } from "./types";

function textOf(message: ChatMessage) {
  return message.parts.map((part) => (part.type === "text" ? part.text : "")).join("");
}

function uploadedSize(data: string) {
  let padding = 0;
  if (data.endsWith("==")) padding = 2;
  else if (data.endsWith("=")) padding = 1;
  return Math.floor((data.length * 3) / 4) - padding;
}
function attachmentOf({ name, mediaType, data }: AttachmentUpload) {
  return { name, mediaType: mediaType ?? "application/octet-stream", size: uploadedSize(data) };
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

export function withoutPending(pending: PendingMessage[], id: string): PendingMessage[] {
  return pending.filter((item) => item.id !== id);
}

export function settlePending(pending: PendingMessage[], event: RunEvent): PendingMessage[] {
  if (pending.length === 0) return pending;
  switch (event.type) {
    case "run_start": {
      const at = pending.findIndex(({ message }) => textOf(message) === event.prompt);
      return at === -1 ? pending : pending.filter((_, index) => index !== at);
    }
    case "steer":
    case "steer_queued":
    case "steer_rejected":
      return withoutPending(pending, event.id);
    case "snapshot": {
      const sent = event.messages.filter((message) => message.role === "user").map(textOf);
      const recent = sent.slice(Math.max(0, sent.length - pending.length));
      return pending.filter(({ message }) => !recent.includes(textOf(message)));
    }
    default:
      return pending;
  }
}
