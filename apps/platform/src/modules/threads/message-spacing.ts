import { shipRequestOf } from "@aven/protocol/ship-request";
import { systemNoteOf } from "@aven/protocol/system-notes";

import { authorOf } from "./message-author";
import type { ChatMessage, QueuedSteer, Speaker, Viewer } from "./types";

const AGENT: Speaker = { kind: "agent" };

const textOf = (message: ChatMessage) =>
  message.parts.map((part) => (part.type === "text" ? part.text : "")).join("");

function personOf(prompt: string, viewer: Viewer, senderId: string | undefined, sending: boolean) {
  const author = authorOf(prompt, viewer, senderId);
  const mine = sending || author.mine;
  return { kind: "person", key: mine ? "me" : author.name, mine } satisfies Speaker;
}

export function speakerOf(message: ChatMessage, viewer: Viewer, sending = false): Speaker | null {
  if (message.role !== "user") return message.parts.length === 0 ? null : AGENT;

  const text = textOf(message);

  if (shipRequestOf(text) !== null) return { kind: "person", key: "me", mine: true };

  const note = systemNoteOf(text);

  if (note?.kind === "process") return null;

  if (note) return AGENT;

  return personOf(text, viewer, message.senderId, sending);
}

export function steerSpeakerOf(steer: QueuedSteer, viewer: Viewer): Speaker | null {
  if (systemNoteOf(steer.prompt)?.kind === "process") return null;

  return personOf(steer.prompt, viewer, steer.senderId, false);
}

export const sameSpeaker = (a: Speaker | null, b: Speaker | null) =>
  a?.kind === "person" && b?.kind === "person" && a.key === b.key;

export function spaceBefore(previous: Speaker | null, current: Speaker) {
  if (!previous) return "";

  if (sameSpeaker(previous, current)) return "mt-1";

  if (previous.kind !== current.kind) return "mt-16";

  return "mt-4";
}
