import type { AgentPrompt, JsonValue, Message, UserContentPart } from "@anvia/core";
import type { MessageAttachment, MessageMention } from "@aven/protocol/events";

import { mentionNote, mentionOf } from "./mentions";
import type { SkillListing } from "./skills";
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

/** What came with a message's text: its files, the images among them in base64 by artifact name, and its mentions with the skills of the run they may name. */
export type SentExtras = {
  attachments?: readonly KeptAttachment[];
  images?: ReadonlyMap<string, string>;
  mentions?: readonly MessageMention[];
  skills?: readonly SkillListing[];
};

/**
 * The prompt of a message: the user's text alone, or, when files or mentions came with it, the
 * text, what was mentioned (decision 0036), where the files are and the images themselves. The
 * metadata keeps the message as the user sent it, for the transcript.
 */
export function sentPrompt(
  prompt: string,
  { attachments = [], images = new Map(), mentions = [], skills = [] }: SentExtras = {},
): AgentPrompt {
  if (attachments.length === 0 && mentions.length === 0) return prompt;
  const content: UserContentPart[] = [];
  if (prompt) content.push({ type: "text", text: prompt });
  const mentioned = mentionNote(mentions, skills);
  if (mentioned) content.push({ type: "text", text: mentioned });
  if (attachments.length > 0) content.push({ type: "text", text: attachmentNote(attachments) });
  for (const file of attachments) {
    const data = file.image && images.get(file.image);
    if (data)
      content.push({ type: "image", image: { type: "data", data }, mediaType: file.mediaType });
  }
  const metadata: Record<string, JsonValue> = { prompt };
  if (attachments.length > 0) metadata.attachments = attachments.map(forTranscript);
  if (mentions.length > 0) metadata.mentions = mentions.map((mention) => ({ ...mention }));
  return { role: "user", content, metadata };
}

function attachmentOf(value: unknown): MessageAttachment | undefined {
  const { name, mediaType, size, image } = asRecord(value);
  if (typeof name !== "string" || typeof mediaType !== "string" || typeof size !== "number") {
    return undefined;
  }
  return typeof image === "string" ? { name, mediaType, size, image } : { name, mediaType, size };
}

const listOf = <T>(value: unknown, read: (item: unknown) => T | undefined) =>
  Array.isArray(value) ? value.map(read).filter((item) => item !== undefined) : [];

/** What a stored user message said, and the files and mentions sent with it, as the user sent them. */
export function sentMessage(message: Extract<Message, { role: "user" }>): {
  text: string;
  attachments?: MessageAttachment[];
  mentions?: MessageMention[];
} {
  const { prompt, attachments, mentions } = asRecord(message.metadata);
  if (typeof prompt === "string" && (Array.isArray(attachments) || Array.isArray(mentions))) {
    return {
      text: prompt,
      attachments: listOf(attachments, attachmentOf),
      mentions: listOf(mentions, mentionOf),
    };
  }
  if (typeof message.content === "string") return { text: message.content };
  return { text: message.content.map((part) => (part.type === "text" ? part.text : "")).join("") };
}
