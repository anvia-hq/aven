import type { Message, UserContentPart, UserMessage } from "@anvia/core";
import type { MessageAttachment } from "@aven/protocol/events";

import { asRecord } from "./values";

/** Where the sandbox has the files users attach (decision 0034); read-only, outside the workspace. */
export const UPLOADS_DIR = "/uploads";

/** A file sent with a message, as the runner kept it: `path` is where the agent finds it. */
export type KeptAttachment = MessageAttachment & { path: string };

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** What the agent is told about the files that came with a message. */
export function attachmentNote(kept: readonly KeptAttachment[]) {
  const lines = kept.map((file) => {
    const shown = file.image ? ", shown to you below" : "";
    return `- ${file.path} (${file.mediaType}, ${formatSize(file.size)}${shown})`;
  });
  return [
    `The user attached ${kept.length === 1 ? "a file" : `${kept.length} files`}. They are in the sandbox, read-only, in ${UPLOADS_DIR}:`,
    ...lines,
  ].join("\n");
}

// Without the path, which is for the agent; and without unset fields, which JSON cannot hold.
function forTranscript({ name, mediaType, size, image }: KeptAttachment): MessageAttachment {
  return image ? { name, mediaType, size, image } : { name, mediaType, size };
}

/**
 * The prompt of a message that came with files: the user's text, a note on where the files are,
 * and the images themselves, which `images` has in base64 by artifact name. The metadata keeps the
 * message as the user sent it, for the transcript.
 */
export function promptWithAttachments(
  prompt: string,
  kept: readonly KeptAttachment[],
  images: ReadonlyMap<string, string>,
): UserMessage {
  const content: UserContentPart[] = [];
  if (prompt) content.push({ type: "text", text: prompt });
  content.push({ type: "text", text: attachmentNote(kept) });
  for (const file of kept) {
    const data = file.image && images.get(file.image);
    if (data)
      content.push({ type: "image", image: { type: "data", data }, mediaType: file.mediaType });
  }
  return {
    role: "user",
    content,
    metadata: { prompt, attachments: kept.map(forTranscript) },
  };
}

function attachmentOf(value: unknown): MessageAttachment | undefined {
  const { name, mediaType, size, image } = asRecord(value);
  if (typeof name !== "string" || typeof mediaType !== "string" || typeof size !== "number") {
    return undefined;
  }
  return typeof image === "string" ? { name, mediaType, size, image } : { name, mediaType, size };
}

/** What a stored user message said, and the files sent with it, as the user sent them. */
export function sentMessage(message: Extract<Message, { role: "user" }>): {
  text: string;
  attachments?: MessageAttachment[];
} {
  const { prompt, attachments } = asRecord(message.metadata);
  if (typeof prompt === "string" && Array.isArray(attachments)) {
    const files = attachments.map(attachmentOf).filter((file) => file !== undefined);
    return { text: prompt, attachments: files };
  }
  if (typeof message.content === "string") return { text: message.content };
  return { text: message.content.map((part) => (part.type === "text" ? part.text : "")).join("") };
}
