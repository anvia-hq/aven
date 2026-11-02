import type { MessageAttachment, QuestionPrompt } from "./events";
import type { ProviderKeyAsk } from "./providers";

// A bot (decision 0058): a named agent a person talks to in a chat of its own. Types and limits
// shared by the control plane and the platform.

export const BOT_NAME_MAX = 60;
export const BOT_INSTRUCTION_MAX = 4000;
export const BOT_DESCRIPTION_MAX = 200;
// Room for a generated look, `{"seed":…,"family":…,"color":…}` (decision 0062), or a short text.
export const BOT_AVATAR_MAX = 120;
// How many bots a person may have, so a bot that makes bots cannot go on making them (decision 0060).
export const BOT_LIMIT = 20;
// The most one message to a bot may hold, from the person or from another bot (decision 0063).
export const BOT_MESSAGE_MAX = 4000;
export const BOT_COMPACT_TOKENS = { min: 1_000, max: 2_000_000 } as const;

/** The handle of the person's main bot, and what the person is called when a bot writes to them (decision 0065). */
export const MAIN_BOT_HANDLE = "main";
export const USER_HANDLE = "user";
// What no other bot may be called: the app's own notes, the person and the main bot.
const RESERVED_HANDLES: readonly string[] = [MAIN_BOT_HANDLE, USER_HANDLE, "system"];

/** The handle a bot of this name starts with: lowercase words joined by dashes, 30 characters at most. */
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

/** `handle` if no handle of `taken` is it, else `handle-2`, `handle-3` and so on. */
export function freeBotHandle(handle: string, taken: ReadonlySet<string>) {
  let free = handle;
  for (let suffix = 2; taken.has(free); suffix++) free = `${handle}-${suffix}`;
  return free;
}

export type Bot = {
  id: string;
  name: string;
  /** How bots name one another: set when the bot is made and kept when it is renamed (decision 0065). */
  handle: string;
  /** What the person told the bot to be like; the bot's own rules for messaging come on top of it. */
  instruction: string;
  /** A line on what the bot is for, shown under its name; empty until it or the person writes one. */
  description: string;
  /** The bot's look as JSON (`{"seed","family","color"}`, each optional), or a short text; empty means the look drawn from the bot's id (decision 0062). */
  avatar: string;
  /** The provider and model the bot talks with; none means the person's default (decision 0058). */
  providerId: string | null;
  modelId: string | null;
  /** A reasoning level of the bot's model; none means the model's own default. */
  reasoningEffort: string | null;
  /** Tokens past which the chat is summarized; none means 70% of the model's context window. */
  compactAfterTokens: number | null;
  /** The person's main bot: the one they always have. */
  isMain: boolean;
  createdAt: string;
  updatedAt: string;
};

/**
 * The other bot of a message between two bots (decisions 0063 and 0065). The chat shows these as
 * one line that opens, not as bubbles, as the Anvia harness does.
 */
export type BotChatPeer = {
  /** What to call it when its bot is not found among the person's, such as one deleted since. */
  name: string;
  /** Names the bot among the person's, live and read back alike. */
  handle: string;
  /** Known when the message was sent live. */
  id?: string;
  /** `to`: this bot wrote it to the peer. `from`: the peer wrote it to this bot. */
  direction: "to" | "from";
};

/**
 * One question a bot asks the person (decision 0066): the thread agent's own shape. One with a
 * `providerKey` is a masked field for a provider's API key, saved to that provider and sent to no
 * one else (decision 0086).
 */
export type BotQuestion = QuestionPrompt & { providerKey?: ProviderKeyAsk };

/** The most questions one `ask_question` may hold, and the most choices one question may have. */
export const BOT_QUESTIONS_MAX = 4;
export const BOT_CHOICES_MAX = 5;

/**
 * One message of a bot's chat: the person's, or one the bot sent. A message with a `peer` is one
 * between this bot and another bot, not the person's: what the other asked, what this bot said back.
 */
export type BotChatMessage = {
  id: string;
  role: "user" | "bot";
  text: string;
  /** The files the person sent with this message (decision 0080): `text` may be empty when there are some. */
  attachments?: MessageAttachment[];
  peer?: BotChatPeer;
  /** The bot is asking the person these; `text` is what they say, in words. The person's answer is their next message. */
  questions?: BotQuestion[];
};

// What a bot is told when someone other than the person wrote to it (decisions 0063 and 0065): the
// text with its sender's handle in front, which the bot's instructions explain and the chat reads
// back. The app itself, to wake a bot with a task, is a note, which the chat does not show.
const FROM_BOT = /^\[from ([a-z0-9][a-z0-9-]*)\] ([\s\S]*)$/;
const NOTE = /^\[note\] ([\s\S]*)$/;

/** The prompt a bot is given for a message another bot sent it. */
export const botPrompt = (fromHandle: string, text: string) => `[from ${fromHandle}] ${text}`;

/** The prompt a bot is given for a note from the app: not the person's, and not shown to them. */
export const botNote = (text: string) => `[note] ${text}`;

// The person's own text that starts like one of those is kept from being read as one (invisibly,
// with a zero-width space), so what is shown when it is sent and when it is read back is the same.
const ZERO_WIDTH_SPACE = "\u200B";

/** The prompt a bot is given for what the person typed. */
export const personPrompt = (text: string) => {
  const { from, note } = parseBotPrompt(text);
  return from !== undefined || note ? `${ZERO_WIDTH_SPACE}${text}` : text;
};

/** Who sent a prompt and what it said: a bot, the app (a note), or the person, whose text is left whole. */
export function parseBotPrompt(prompt: string): { from?: string; note?: boolean; text: string } {
  const bot = FROM_BOT.exec(prompt);
  if (bot) return { from: bot[1]!, text: bot[2]! };
  const note = NOTE.exec(prompt);
  return note ? { note: true, text: note[1]! } : { text: prompt };
}

/**
 * How many messages between bots may follow one another before a bot must tell the person instead,
 * so two bots cannot answer each other for ever (decision 0065).
 */
export const BOT_MAX_HOPS = 8;

/** How many messages to other bots one reply may write, so one bot cannot fill the others' queues (decision 0065). */
export const BOT_MESSAGES_PER_REPLY = 10;

/** What a client hears about a bot's chat (decision 0058): not a `RunEvent`, which would join several messages into one. */
export type BotEvent =
  /** The whole chat, sent when a client connects. `typing` is whether the bot is at work on a reply. */
  | { type: "snapshot"; messages: BotChatMessage[]; typing: boolean }
  | { type: "message"; message: BotChatMessage }
  | { type: "typing"; typing: boolean }
  | { type: "error"; message: string };

/** The id of the message at `index` in a chat; a snapshot and the live events agree on it. */
export const botMessageId = (index: number) => `m-${index}`;

/** The chat after one more event. */
export function applyBotEvent(messages: BotChatMessage[], event: BotEvent): BotChatMessage[] {
  if (event.type === "snapshot") return event.messages;
  if (event.type === "message") return [...messages, event.message];
  return messages;
}

/** Whether the bot is typing after one more event. */
export function isTyping(previous: boolean, event: BotEvent) {
  return event.type === "snapshot" || event.type === "typing" ? event.typing : previous;
}
