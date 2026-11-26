import type { JsonObject, JsonValue, Message } from "@anvia/core";
import type { ProviderKeyAsk, ToolArtifact } from "@aven/protocol/types";

import { asRecord } from "./values";
import type { ToolUiEntry, ToolUiRecorder } from "./types";

type Pending = { toolName: string; text: string; ui: ToolUiEntry };

function takeFrom(queue: Pending[], toolName: string, text: string): ToolUiEntry | undefined {
  let index = queue.findIndex((entry) => entry.toolName === toolName && entry.text === text);

  if (index === -1) {
    index = queue.findIndex((entry) => entry.toolName === toolName && text.startsWith(entry.text));
  }

  if (index === -1) index = queue.findIndex((entry) => entry.toolName === toolName);

  if (index === -1) return undefined;

  return queue.splice(index, 1)[0]?.ui;
}

function serializeEntry(entry: ToolUiEntry): JsonObject {
  const out: Record<string, JsonValue> = {};

  if (entry.artifacts?.length) {
    out.artifacts = entry.artifacts.map((artifact) => {
      const item: Record<string, JsonValue> = {
        name: artifact.name,
        mediaType: artifact.mediaType,
      };

      if (artifact.caption !== undefined) item.caption = artifact.caption;

      if (artifact.title !== undefined) item.title = artifact.title;

      if (artifact.size !== undefined) item.size = artifact.size;

      return item;
    });
  }

  if (entry.relayed) {
    out.relayed = { handle: entry.relayed.handle, text: entry.relayed.text };
  }

  if (entry.provider) {
    out.provider = { providerId: entry.provider.providerId, name: entry.provider.name };
  }

  return out;
}

export function withToolUiMetadata(
  message: Message,
  entries: Record<string, ToolUiEntry>,
): Message {
  const keys = Object.keys(entries);

  if (keys.length === 0) return message;

  const existingMetadata = asRecord(message.metadata);
  const existingToolUi = asRecord(existingMetadata.toolUi);
  const nextToolUi: Record<string, JsonValue> = {
    ...(existingToolUi as Record<string, JsonValue>),
  };
  for (const [id, entry] of Object.entries(entries)) nextToolUi[id] = serializeEntry(entry);

  return {
    ...message,
    metadata: {
      ...(existingMetadata as Record<string, JsonValue>),
      toolUi: nextToolUi,
    },
  } as Message;
}

export function createToolUiRecorder(): ToolUiRecorder {
  const live: Pending[] = [];
  const persist: Pending[] = [];

  return {
    record(toolName, text, ui) {
      live.push({ toolName, text, ui });
      persist.push({ toolName, text, ui });
    },
    takeLive(toolName, text) {
      return takeFrom(live, toolName, text);
    },
    attach(messages) {
      if (persist.length === 0) return [...messages];

      return messages.map((message) => {
        if (message.role !== "tool") return message;

        const entries: Record<string, ToolUiEntry> = {};
        for (const part of message.content) {
          if (part.type !== "tool-result" || part.output.type !== "text") continue;

          const found = takeFrom(persist, part.toolName, part.output.value);

          if (found) entries[part.toolCallId] = found;
        }
        return withToolUiMetadata(message, entries);
      });
    },
  };
}

function parseArtifacts(value: unknown): ToolArtifact[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const kept = value.flatMap((entry): ToolArtifact[] => {
    const { name, mediaType, caption, title, size } = asRecord(entry);

    if (typeof name !== "string" || typeof mediaType !== "string") return [];

    const artifact: ToolArtifact = { name, mediaType };

    if (typeof caption === "string") artifact.caption = caption;

    if (typeof title === "string") artifact.title = title;

    if (typeof size === "number") artifact.size = size;

    return [artifact];
  });
  return kept.length > 0 ? kept : undefined;
}

function parseRelayed(value: unknown): { handle: string; text: string } | undefined {
  const { handle, text } = asRecord(value);

  if (typeof handle !== "string" || typeof text !== "string") return undefined;

  return { handle, text };
}

function parseProvider(value: unknown): ProviderKeyAsk | undefined {
  const { providerId, name } = asRecord(value);

  if (typeof providerId !== "string" || typeof name !== "string") return undefined;

  return { providerId, name };
}

export function readToolUi(
  message: Message | undefined,
  toolCallId: string,
): ToolUiEntry | undefined {
  if (!message || message.role !== "tool") return undefined;

  const raw = asRecord(asRecord(asRecord(message.metadata).toolUi)[toolCallId]);
  const artifacts = parseArtifacts(raw.artifacts);
  const relayed = parseRelayed(raw.relayed);
  const provider = parseProvider(raw.provider);

  if (!artifacts && !relayed && !provider) return undefined;

  const entry: ToolUiEntry = {};

  if (artifacts) entry.artifacts = artifacts;

  if (relayed) entry.relayed = relayed;

  if (provider) entry.provider = provider;

  return entry;
}
