import type { BotChatMessage, BotEvent } from "./types";

export const BOT_NAME_MAX = 60;
export const BOT_INSTRUCTION_MAX = 4000;
export const BOT_DESCRIPTION_MAX = 200;
export const BOT_AVATAR_MAX = 120;
export const BOT_LIMIT = 20;
export const BOT_MESSAGE_MAX = 4000;
export const BOT_COMPACT_TOKENS = { min: 1_000, max: 2_000_000 } as const;

export const MAIN_BOT_HANDLE = "main";
export const USER_HANDLE = "user";
const RESERVED_HANDLES: readonly string[] = [MAIN_BOT_HANDLE, USER_HANDLE, "system"];

export function botHandleOf(name: string) {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 30)
    .replace(/^-+|-+$/g, "");
  if (!slug) return "bot";
  return RESERVED_HANDLES.includes(slug) ? `${slug}-bot` : slug;
}

export function freeBotHandle(handle: string, taken: ReadonlySet<string>) {
  let free = handle;
  for (let suffix = 2; taken.has(free); suffix++) free = `${handle}-${suffix}`;
  return free;
}

export const BOT_QUESTIONS_MAX = 4;
export const BOT_CHOICES_MAX = 5;

const FROM_BOT = /^\[from ([a-z0-9][a-z0-9-]*)\] ([\s\S]*)$/;
const NOTE = /^\[note\] ([\s\S]*)$/;

export const botPrompt = (fromHandle: string, text: string) => `[from ${fromHandle}] ${text}`;

export const botNote = (text: string) => `[note] ${text}`;

const PERSON_MARK = "\u200B";

export const personPrompt = (text: string) => {
  const { from, note } = parseBotPrompt(text);
  return from === undefined && !note ? text : `${PERSON_MARK}${text}`;
};

export function parseBotPrompt(prompt: string): { from?: string; note?: boolean; text: string } {
  const bot = FROM_BOT.exec(prompt);
  if (bot) return { from: bot[1]!, text: bot[2]! };
  const note = NOTE.exec(prompt);
  if (note) return { note: true, text: note[1]! };
  return { text: prompt.startsWith(PERSON_MARK) ? prompt.slice(PERSON_MARK.length) : prompt };
}

export const BOT_MAX_HOPS = 8;

export const BOT_MESSAGES_PER_REPLY = 10;

export const botMessageId = (index: number) => `m-${index}`;

export function applyBotEvent(messages: BotChatMessage[], event: BotEvent): BotChatMessage[] {
  if (event.type === "snapshot") return event.messages;
  if (event.type === "message") return [...messages, event.message];
  return messages;
}

export function isTyping(previous: boolean, event: BotEvent) {
  return event.type === "snapshot" || event.type === "typing" ? event.typing : previous;
}
