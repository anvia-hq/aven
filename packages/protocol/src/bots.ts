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

export type Bot = {
  id: string;
  name: string;
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
 * The other bot of a message between two bots (decision 0063). The chat shows these as one line
 * that opens, not as bubbles, as the Anvia harness does.
 */
export type BotChatPeer = {
  name: string;
  /** Known when the message was sent live; a chat read back from what the bot remembers has the name only. */
  id?: string;
  /** `to`: this bot wrote it to the peer. `from`: the peer wrote it to this bot. */
  direction: "to" | "from";
};

/**
 * One message of a bot's chat: the person's, or one the bot sent. A message with a `peer` is one
 * between this bot and another bot, not the person's: what the other asked, what this bot said back.
 */
export type BotChatMessage = {
  id: string;
  role: "user" | "bot";
  text: string;
  peer?: BotChatPeer;
};

// What a bot is told when someone other than the person wrote to it (decision 0063): the text
// with its sender in front, which the bot's instructions explain and the chat reads back. A bot
// that wrote to it is named; the app itself, to wake a bot with a task, is a note, which the chat
// does not show.
const FROM_BOT = /^\[from bot ([^\]\n]+)\] ([\s\S]*)$/;
const NOTE = /^\[note\] ([\s\S]*)$/;

/** The prompt a bot is given for a message another bot sent it. */
export const botPrompt = (from: string, text: string) =>
  `[from bot ${from.replace(/[\]\n]/g, " ")}] ${text}`;

/** The prompt a bot is given for a note from the app: not the person's, and not shown to them. */
export const botNote = (text: string) => `[note] ${text}`;

/** Who sent a prompt and what it said: a bot, the app (a note), or the person, whose text is left whole. */
export function parseBotPrompt(prompt: string): { from?: string; note?: boolean; text: string } {
  const bot = FROM_BOT.exec(prompt);
  if (bot) return { from: bot[1]!, text: bot[2]! };
  const note = NOTE.exec(prompt);
  return note ? { note: true, text: note[1]! } : { text: prompt };
}

/** How long a bot waits for another to answer it (decision 0063), and so how long a call for that may take. */
export const BOT_ASK_TIMEOUT_MS = 300_000;

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
