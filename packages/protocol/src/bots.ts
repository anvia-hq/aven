// A bot (decision 0058): a named agent a person talks to in a chat of its own. Types and limits
// shared by the control plane and the platform.

export const BOT_NAME_MAX = 60;
export const BOT_INSTRUCTION_MAX = 4000;
export const BOT_AVATAR_MAX = 16;
// How many bots a person may have, so a bot that makes bots cannot go on making them (decision 0060).
export const BOT_LIMIT = 20;
export const BOT_COMPACT_TOKENS = { min: 1_000, max: 2_000_000 } as const;

export type Bot = {
  id: string;
  name: string;
  /** What the person told the bot to be like; the bot's own rules for messaging come on top of it. */
  instruction: string;
  /** A short string, an emoji; empty shows the name's first letter. */
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

/** One message of a bot's chat: the person's, or one the bot sent. */
export type BotChatMessage = { id: string; role: "user" | "bot"; text: string };

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
