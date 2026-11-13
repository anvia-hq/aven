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

export const BOT_REACTIONS_MAX = 6;
export const BOT_REACTION_MAX = 32;

export const BOT_MESSAGE_ID = /^[mb]-\d+$/;

const QUOTED_MAX = 300;

const FROM_BOT = /^\[from ([a-z0-9][a-z0-9-]*)\] ([\s\S]*)$/;
const NOTE = /^\[note\] ([\s\S]*)$/;
const MESSAGE_ID = /^\[([mb]-\d+)\] /;
const REPLYING_TO = /^\[replying to ([mb]-\d+)\] ([^\n]*)\n/;

export const botPrompt = (fromHandle: string, text: string) => `[from ${fromHandle}] ${text}`;

export const botNote = (text: string) => `[note] ${text}`;

const singleLine = (text: string) => text.replace(/\s+/g, " ").trim().slice(0, QUOTED_MAX);

export const botMessagePrompt = (
  id: string,
  prompt: string,
  quote?: { id: string; text: string },
) => `[${id}] ${quote ? `[replying to ${quote.id}] ${singleLine(quote.text)}\n` : ""}${prompt}`;

export const isBotReaction = (emoji: string) => {
  const segments = [...new Intl.Segmenter().segment(emoji)];
  return segments.length === 1 && /\p{Extended_Pictographic}/u.test(emoji);
};

const PERSON_MARK = "\u200B";

export const personPrompt = (text: string) => {
  const { from, note } = parseBotPrompt(text);
  return from === undefined && !note ? text : `${PERSON_MARK}${text}`;
};

export type ParsedBotPrompt = {
  id?: string;
  quoted?: string;
  from?: string;
  note?: boolean;
  text: string;
};

export function parseBotPrompt(prompt: string): ParsedBotPrompt {
  let rest = prompt;
  let id: string | undefined;
  let quoted: string | undefined;

  const tagged = MESSAGE_ID.exec(rest);

  if (tagged) {
    id = tagged[1]!;
    rest = rest.slice(tagged[0].length);
    const reply = REPLYING_TO.exec(rest);

    if (reply) {
      quoted = reply[1]!;
      rest = rest.slice(reply[0].length);
    }
  }

  const parsed = parsedPrompt(rest);

  if (id) parsed.id = id;

  if (quoted) parsed.quoted = quoted;

  return parsed;
}

function parsedPrompt(prompt: string): ParsedBotPrompt {
  const bot = FROM_BOT.exec(prompt);

  if (bot) return { from: bot[1]!, text: bot[2]! };

  const note = NOTE.exec(prompt);

  if (note) return { note: true, text: note[1]! };

  return { text: prompt.startsWith(PERSON_MARK) ? prompt.slice(PERSON_MARK.length) : prompt };
}

export const BOT_MAX_HOPS = 8;

export const BOT_MESSAGES_PER_REPLY = 10;

export const incomingMessageId = (index: number) => `m-${index}`;

export const sentMessageId = (index: number) => `b-${index}`;

export function applyBotEvent(messages: BotChatMessage[], event: BotEvent): BotChatMessage[] {
  if (event.type === "snapshot") return event.messages;

  if (event.type === "message") return [...messages, event.message];

  if (event.type === "reaction") {
    return messages.map((message) => {
      if (message.id !== event.messageId || message.reactions?.includes(event.emoji)) {
        return message;
      }

      const reactions = message.reactions ? [...message.reactions, event.emoji] : [event.emoji];
      return { ...message, reactions };
    });
  }

  return messages;
}

export function isTyping(previous: boolean, event: BotEvent) {
  return event.type === "snapshot" || event.type === "typing" ? event.typing : previous;
}

export function activityOf(previous: string | null, event: BotEvent) {
  if (event.type === "snapshot") return event.activity ?? null;

  if (event.type === "activity") return event.label;

  return event.type === "typing" && !event.typing ? null : previous;
}
