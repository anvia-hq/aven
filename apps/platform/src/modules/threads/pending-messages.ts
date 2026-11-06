import type { ChatMessage, RunEvent } from "@aven/protocol/events";

import type { AttachmentUpload, OutgoingMessage } from "./types";

/**
 * A message this browser sent that the server has not shown yet, so the conversation shows it at
 * once instead of after the request (decision 0117). `id` is the one the message was sent with,
 * which the server sends back on the events that concern it.
 */
export type PendingMessage = { id: string; message: ChatMessage };

function textOf(message: ChatMessage) {
  return message.parts.map((part) => (part.type === "text" ? part.text : "")).join("");
}

// The bytes of a file as the composer holds it: its base64, without the padding.
function uploadedSize(data: string) {
  let padding = 0;
  if (data.endsWith("==")) padding = 2;
  else if (data.endsWith("=")) padding = 1;
  return Math.floor((data.length * 3) / 4) - padding;
}
function attachmentOf({ name, mediaType, data }: AttachmentUpload) {
  return { name, mediaType: mediaType ?? "application/octet-stream", size: uploadedSize(data) };
}

/**
 * The message as it will be shown, made before the server has it. Its id names it on this browser
 * alone: the transcript's own message is one of the server's, with an id of its own.
 */
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

/** Drops the message `id` names: it was not sent, or the server shows it another way. */
export function withoutPending(pending: PendingMessage[], id: string): PendingMessage[] {
  return pending.filter((item) => item.id !== id);
}

/**
 * What is still waiting after the server spoke. `run_start` and `steer` carry a message the agent
 * now has, so the one shown from here goes; `steer_queued` says it waits as a queued message
 * instead, and `steer_rejected` that it will not come. A stream that attached again (`snapshot`)
 * may already list what was sent while it was away.
 */
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
      // Only the latest ones can be what was sent while the stream was away: an older message with
      // the same words is another one, which this does not stand for.
      const recent = sent.slice(Math.max(0, sent.length - pending.length));
      return pending.filter(({ message }) => !recent.includes(textOf(message)));
    }
    default:
      return pending;
  }
}
