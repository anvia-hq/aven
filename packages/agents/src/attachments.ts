import type { AgentPrompt, JsonValue, Message, UserContentPart } from "@anvia/core";

import { mentionNote, mentionOf } from "./mentions";
import { SANDBOX_PATHS } from "./sandbox-paths";
import { asRecord } from "./values";
import type { KeptAttachment, SandboxPaths, SentExtras } from "./types";
import type { MessageAttachment, MessageMention } from "@aven/protocol/types";

export const UPLOADS_DIR = "/uploads";

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;

  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function fileLine(file: KeptAttachment) {
  const shown = file.image ? ", shown to you below" : "";
  return `- ${file.path} (${file.mediaType}, ${formatSize(file.size)}${shown})`;
}

function held(file: KeptAttachment) {
  return !file.path.includes("/") && !file.path.includes("\\");
}

function sharedDirectory(files: readonly KeptAttachment[]) {
  const directories = new Set(
    files.map((file) => {
      const slash = Math.max(file.path.lastIndexOf("/"), file.path.lastIndexOf("\\"));
      return slash > 0 ? file.path.slice(0, slash) : "";
    }),
  );
  directories.delete("");
  return directories.size === 1 ? [...directories][0] : undefined;
}

function attachmentNote(kept: readonly KeptAttachment[], paths: SandboxPaths) {
  const waiting = kept.filter(held);
  const ready = kept.filter((file) => !held(file));
  const parts: string[] = [];

  if (ready.length > 0) {
    const count = ready.length === 1 ? "a file" : `${ready.length} files`;
    parts.push(
      [
        `The user attached ${count}. They are on this machine, read-only, in ${sharedDirectory(ready) ?? paths.uploads}:`,
        ...ready.map(fileLine),
      ].join("\n"),
    );
  }

  if (waiting.length > 0) {
    const intro =
      waiting.length === 1
        ? "A file is waiting to be written to the computer. When the computer is reached, it is written to that computer's uploads folder under this name:"
        : `${waiting.length} files are waiting to be written to the computer. When the computer is reached, they are written to that computer's uploads folder under these names:`;
    parts.push([intro, ...waiting.map(fileLine)].join("\n"));
  }

  return parts.join("\n\n");
}

function forTranscript({ name, mediaType, size, image }: KeptAttachment): MessageAttachment {
  return image ? { name, mediaType, size, image } : { name, mediaType, size };
}

export function sentPrompt(
  prompt: string,
  {
    attachments = [],
    images = new Map(),
    mentions = [],
    skills = [],
    paths = SANDBOX_PATHS,
  }: SentExtras = {},
): AgentPrompt {
  if (attachments.length === 0 && mentions.length === 0) return prompt;

  const content: UserContentPart[] = [];

  if (prompt) content.push({ type: "text", text: prompt });

  const mentioned = mentionNote(mentions, skills, paths);

  if (mentioned) content.push({ type: "text", text: mentioned });

  if (attachments.length > 0)
    content.push({ type: "text", text: attachmentNote(attachments, paths) });

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
