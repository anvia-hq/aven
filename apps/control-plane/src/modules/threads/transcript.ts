import type { ChatMessage, MessageAttachment, MessagePart } from "@aven/protocol/types";

import type { TranscriptEntry } from "./types";

function partEntries(part: MessagePart): TranscriptEntry[] {
  if (part.type === "text") {
    const text = part.text.trim();
    return text.length > 0 ? [{ kind: "prose", text }] : [];
  }

  if (part.type === "reasoning") {
    const text = part.text.trim();
    return text.length > 0 ? [{ kind: "reasoning", text }] : [];
  }

  return [
    {
      kind: "bullet",
      code: part.tool.name,
      text: `${part.tool.target} (${part.tool.status})`,
    },
  ];
}

function attachmentEntry(attachment: MessageAttachment): TranscriptEntry {
  return { kind: "bullet", text: `Attached: ${attachment.name} (${attachment.mediaType})` };
}

function messageEntries(message: ChatMessage): TranscriptEntry[] {
  const entries = message.parts.flatMap(partEntries);

  for (const attachment of message.attachments ?? []) entries.push(attachmentEntry(attachment));

  if (entries.length === 0) return [];

  return [
    { kind: "heading", level: 2, text: message.role === "user" ? "User" : "Assistant" },
    ...entries,
  ];
}

export function transcriptOf(title: string, messages: readonly ChatMessage[]): TranscriptEntry[] {
  return [{ kind: "heading", level: 1, text: title }, ...messages.flatMap(messageEntries)];
}
